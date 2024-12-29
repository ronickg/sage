use std::{
    sync::Arc,
    time::{Duration, Instant},
};

use chia::{
    bls::DerivableKey,
    protocol::{Bytes32, CoinState, CoinStateFilters},
    puzzles::{standard::StandardArgs, DeriveSynthetic},
};
use rayon::iter::{IntoParallelIterator, ParallelIterator};
use tokio::{
    sync::{mpsc, Mutex},
    task::spawn_blocking,
    time::{sleep, timeout},
};
use tracing::{debug, info, warn};

use crate::{delete_puzzle, upsert_coin, UpsertCounters, Wallet, WalletError, WalletPeer};

use super::{PeerState, SyncEvent};

pub async fn sync_wallet(
    wallet: Arc<Wallet>,
    peer: WalletPeer,
    state: Arc<Mutex<PeerState>>,
    sync_sender: mpsc::Sender<SyncEvent>,
) -> Result<(), WalletError> {
    info!("Starting sync against peer {}", peer.socket_addr());

    let p2_puzzle_hashes = wallet.db.p2_puzzle_hashes().await?;

    let (start_height, start_header_hash) = wallet.db.latest_peak().await?.map_or_else(
        || (None, wallet.genesis_challenge),
        |(peak, header_hash)| (Some(peak), header_hash),
    );

    let mut coin_ids = Vec::new();
    coin_ids.extend(wallet.db.unspent_nft_coin_ids().await?);
    coin_ids.extend(wallet.db.unspent_did_coin_ids().await?);
    coin_ids.extend(wallet.db.unspent_cat_coin_ids().await?);

    sync_coin_ids(
        &wallet,
        &peer,
        start_height,
        start_header_hash,
        coin_ids,
        sync_sender.clone(),
    )
    .await?;

    let mut derive_more = p2_puzzle_hashes.is_empty();

    for batch in p2_puzzle_hashes.chunks(500) {
        derive_more |= sync_puzzle_hashes(
            &wallet,
            &peer,
            start_height,
            start_header_hash,
            batch,
            sync_sender.clone(),
        )
        .await?;
    }

    let mut start_index = p2_puzzle_hashes.len() as u32;

    while derive_more {
        derive_more = false;

        let intermediate_pk = wallet.intermediate_pk;

        let new_derivations = spawn_blocking(move || {
            (start_index..start_index + 500)
                .into_par_iter()
                .map(|index| {
                    let synthetic_key = intermediate_pk.derive_unhardened(index).derive_synthetic();
                    let p2_puzzle_hash =
                        Bytes32::from(StandardArgs::curry_tree_hash(synthetic_key));
                    (index, synthetic_key, p2_puzzle_hash)
                })
                .collect::<Vec<_>>()
        })
        .await?;

        let p2_puzzle_hashes: Vec<Bytes32> = new_derivations
            .iter()
            .map(|(_, _, p2_puzzle_hash)| *p2_puzzle_hash)
            .collect();

        start_index += new_derivations.len() as u32;

        let mut tx = wallet.db.tx().await?;
        for (index, synthetic_key, p2_puzzle_hash) in new_derivations {
            tx.insert_derivation(p2_puzzle_hash, index, false, synthetic_key)
                .await?;
        }
        tx.commit().await?;

        sync_sender
            .send(SyncEvent::DerivationIndex {
                next_index: start_index,
            })
            .await
            .ok();

        for batch in p2_puzzle_hashes.chunks(500) {
            derive_more |= sync_puzzle_hashes(
                &wallet,
                &peer,
                None,
                wallet.genesis_challenge,
                batch,
                sync_sender.clone(),
            )
            .await?;
        }
    }

    if let Some((height, header_hash)) = state.lock().await.peak_of(peer.socket_addr().ip()) {
        // TODO: Maybe look into a better way.
        info!(
            "Updating peak from peer to {} with header hash {}",
            height, header_hash
        );
        wallet.db.insert_peak(height, header_hash).await?;
    } else {
        warn!("No peak found");
    }

    Ok(())
}

async fn sync_coin_ids(
    wallet: &Wallet,
    peer: &WalletPeer,
    start_height: Option<u32>,
    start_header_hash: Bytes32,
    coin_ids: Vec<Bytes32>,
    sync_sender: mpsc::Sender<SyncEvent>,
) -> Result<(), WalletError> {
    for (i, coin_ids) in coin_ids.chunks(10000).enumerate() {
        if i != 0 {
            sleep(Duration::from_millis(500)).await;
        }

        debug!(
            "Subscribing to {} coins from peer {}",
            coin_ids.len(),
            peer.socket_addr()
        );

        let coin_states = timeout(
            Duration::from_secs(10),
            peer.subscribe_coins(coin_ids.to_vec(), start_height, start_header_hash),
        )
        .await??;

        debug!("Received {} coin states", coin_states.len());

        if !coin_states.is_empty() {
            incremental_sync(wallet, coin_states, true, &sync_sender).await?;
        }
    }

    Ok(())
}

async fn sync_puzzle_hashes(
    wallet: &Wallet,
    peer: &WalletPeer,
    start_height: Option<u32>,
    start_header_hash: Bytes32,
    puzzle_hashes: &[Bytes32],
    sync_sender: mpsc::Sender<SyncEvent>,
) -> Result<bool, WalletError> {
    let mut prev_height = start_height;
    let mut prev_header_hash = start_header_hash;
    let mut found_coins = false;

    loop {
        debug!(
            "Subscribing to puzzles at height {:?} and header hash {} from peer {}",
            prev_height,
            prev_header_hash,
            peer.socket_addr()
        );

        let data = timeout(
            Duration::from_secs(45),
            peer.subscribe_puzzles(
                puzzle_hashes.to_vec(),
                prev_height,
                prev_header_hash,
                CoinStateFilters::new(true, true, true, 0),
            ),
        )
        .await??;

        debug!("Received {} coin states", data.coin_states.len());

        if !data.coin_states.is_empty() {
            found_coins = true;
            incremental_sync(wallet, data.coin_states, true, &sync_sender).await?;
        }

        prev_height = Some(data.height);
        prev_header_hash = data.header_hash;

        if data.is_finished {
            break;
        }
    }

    Ok(found_coins)
}

pub async fn incremental_sync(
    wallet: &Wallet,
    coin_states: Vec<CoinState>,
    derive_automatically: bool,
    sync_sender: &mpsc::Sender<SyncEvent>,
) -> Result<(), WalletError> {
    let mut tx = wallet.db.tx().await?;

    let start = Instant::now();

    let mut counters = UpsertCounters::default();

    for &coin_state in &coin_states {
        upsert_coin(&mut tx, coin_state, None, &mut counters).await?;

        if coin_state.spent_height.is_some() {
            let start = Instant::now();
            delete_puzzle(&mut tx, coin_state.coin.coin_id()).await?;
            counters.delete_puzzle += start.elapsed();
        }
    }

    debug!(
        "Upserted {} coins in {:?}, with counters {:?}",
        coin_states.len(),
        start.elapsed(),
        counters
    );

    let mut derived = false;

    let mut next_index = tx.derivation_index(false).await?;

    if derive_automatically {
        let max_index = tx
            .max_used_derivation_index(false)
            .await?
            .map_or(0, |index| index + 1);

        while next_index < max_index + 500 {
            wallet
                .insert_unhardened_derivations(&mut tx, next_index..next_index + 500)
                .await?;

            derived = true;
            next_index += 500;
        }
    }

    tx.commit().await?;

    sync_sender
        .send(SyncEvent::CoinsUpdated { coin_states })
        .await
        .ok();

    if derived {
        sync_sender
            .send(SyncEvent::DerivationIndex { next_index })
            .await
            .ok();
    }

    Ok(())
}
