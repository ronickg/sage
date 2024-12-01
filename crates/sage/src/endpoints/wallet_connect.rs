use chia::{
    bls::{master_to_wallet_unhardened, sign},
    clvm_utils::{CurriedProgram, ToTreeHash},
    puzzles::{cat::CatArgs, standard::StandardArgs, DeriveSynthetic, Proof},
};
use chia_wallet_sdk::{Layer, SpendContext};
use sage_api::wallet_connect::{
    AssetCoinType, Coin, FilterUnlockedCoins, FilterUnlockedCoinsResponse, GetAssetCoins,
    GetAssetCoinsResponse, LineageProof, SignMessageWithPublicKey,
    SignMessageWithPublicKeyResponse, SpendableCoin,
};

use crate::{
    parse_asset_id, parse_coin_id, parse_did_id, parse_nft_id, parse_public_key, Error, Result,
    Sage,
};

impl Sage {
    pub async fn filter_unlocked_coins(
        &self,
        req: FilterUnlockedCoins,
    ) -> Result<FilterUnlockedCoinsResponse> {
        let wallet = self.wallet()?;
        let mut coin_ids = Vec::new();

        for coin_id in req.coin_ids {
            if !wallet
                .db
                .is_coin_locked(parse_coin_id(coin_id.clone())?)
                .await?
            {
                coin_ids.push(coin_id);
            }
        }

        Ok(FilterUnlockedCoinsResponse { coin_ids })
    }

    pub async fn get_asset_coins(&self, req: GetAssetCoins) -> Result<GetAssetCoinsResponse> {
        let include_locked = req.included_locked.unwrap_or(false);
        let wallet = self.wallet()?;

        let mut items = Vec::new();

        if let Some(kind) = req.kind {
            match kind {
                AssetCoinType::Cat => {
                    let asset_id = parse_asset_id(req.asset_id.ok_or(Error::MissingAssetId)?)?;

                    let rows = wallet
                        .db
                        .created_unspent_cat_coin_states(
                            asset_id,
                            req.limit.unwrap_or(10),
                            req.offset.unwrap_or(0),
                        )
                        .await?;

                    for row in rows {
                        let cs = row.coin_state;

                        let in_transaction = wallet
                            .db
                            .coin_transaction_id(cs.coin.coin_id())
                            .await?
                            .is_some();

                        if !include_locked && in_transaction {
                            continue;
                        }

                        let is_offered =
                            wallet.db.coin_offer_id(cs.coin.coin_id()).await?.is_some();

                        if !include_locked && is_offered {
                            continue;
                        }

                        let Some(cat) = wallet.db.cat_coin(cs.coin.coin_id()).await? else {
                            return Err(Error::MissingCatCoin(cs.coin.coin_id()));
                        };

                        let synthetic_key = wallet.db.synthetic_key(cat.p2_puzzle_hash).await?;

                        let mut ctx = SpendContext::new();
                        let p2_puzzle = CurriedProgram {
                            program: ctx.standard_puzzle()?,
                            args: StandardArgs::new(synthetic_key),
                        };
                        let cat_puzzle = CurriedProgram {
                            program: ctx.cat_puzzle()?,
                            args: CatArgs::new(cat.asset_id, p2_puzzle),
                        };

                        items.push(SpendableCoin {
                            coin: Coin {
                                parent_coin_info: hex::encode(cs.coin.parent_coin_info),
                                puzzle_hash: hex::encode(cs.coin.puzzle_hash),
                                amount: cs.coin.amount,
                            },
                            coin_name: hex::encode(cs.coin.coin_id()),
                            puzzle: hex::encode(ctx.serialize(&cat_puzzle)?),
                            confirmed_block_index: cs.created_height.expect("not created"),
                            locked: in_transaction || is_offered,
                            lineage_proof: cat.lineage_proof.map(|proof| LineageProof {
                                parent_name: Some(hex::encode(proof.parent_parent_coin_info)),
                                inner_puzzle_hash: Some(hex::encode(
                                    proof.parent_inner_puzzle_hash,
                                )),
                                amount: Some(proof.parent_amount),
                            }),
                        });
                    }
                }
                AssetCoinType::Did => {
                    let asset_id = if let Some(asset_id) = req.asset_id {
                        Some(if let Ok(asset_id) = parse_asset_id(asset_id.clone()) {
                            asset_id
                        } else {
                            parse_did_id(asset_id)?
                        })
                    } else {
                        None
                    };

                    let rows = if let Some(asset_id) = asset_id {
                        wallet.db.created_unspent_did_coin_state(asset_id).await?
                    } else {
                        wallet
                            .db
                            .created_unspent_did_coin_states(
                                req.limit.unwrap_or(10),
                                req.offset.unwrap_or(0),
                            )
                            .await?
                    };

                    for row in rows {
                        let cs = row.coin_state;

                        let in_transaction = wallet
                            .db
                            .coin_transaction_id(cs.coin.coin_id())
                            .await?
                            .is_some();

                        if !include_locked && in_transaction {
                            continue;
                        }

                        let is_offered =
                            wallet.db.coin_offer_id(cs.coin.coin_id()).await?.is_some();

                        if !include_locked && is_offered {
                            continue;
                        }

                        let Some(did) = wallet.db.did_by_coin_id(cs.coin.coin_id()).await? else {
                            return Err(Error::MissingCoin(cs.coin.coin_id()));
                        };

                        let synthetic_key =
                            wallet.db.synthetic_key(did.info.p2_puzzle_hash).await?;

                        let mut ctx = SpendContext::new();
                        let p2_puzzle = CurriedProgram {
                            program: ctx.standard_puzzle()?,
                            args: StandardArgs::new(synthetic_key),
                        };
                        let did_puzzle =
                            did.info.into_layers(p2_puzzle).construct_puzzle(&mut ctx)?;

                        items.push(SpendableCoin {
                            coin: Coin {
                                parent_coin_info: hex::encode(cs.coin.parent_coin_info),
                                puzzle_hash: hex::encode(cs.coin.puzzle_hash),
                                amount: cs.coin.amount,
                            },
                            coin_name: hex::encode(cs.coin.coin_id()),
                            puzzle: hex::encode(ctx.serialize(&did_puzzle)?),
                            confirmed_block_index: cs.created_height.expect("not created"),
                            locked: in_transaction || is_offered,
                            lineage_proof: Some(match did.proof {
                                Proof::Lineage(proof) => LineageProof {
                                    parent_name: Some(hex::encode(proof.parent_parent_coin_info)),
                                    inner_puzzle_hash: Some(hex::encode(
                                        proof.parent_inner_puzzle_hash,
                                    )),
                                    amount: Some(proof.parent_amount),
                                },
                                Proof::Eve(proof) => LineageProof {
                                    parent_name: Some(hex::encode(proof.parent_parent_coin_info)),
                                    inner_puzzle_hash: None,
                                    amount: Some(proof.parent_amount),
                                },
                            }),
                        });
                    }
                }
                AssetCoinType::Nft => {
                    let asset_id = if let Some(asset_id) = req.asset_id {
                        Some(if let Ok(asset_id) = parse_asset_id(asset_id.clone()) {
                            asset_id
                        } else {
                            parse_nft_id(asset_id)?
                        })
                    } else {
                        None
                    };

                    let rows = if let Some(asset_id) = asset_id {
                        wallet.db.created_unspent_nft_coin_state(asset_id).await?
                    } else {
                        wallet
                            .db
                            .created_unspent_nft_coin_states(
                                req.limit.unwrap_or(10),
                                req.offset.unwrap_or(0),
                            )
                            .await?
                    };

                    for row in rows {
                        let cs = row.coin_state;

                        let in_transaction = wallet
                            .db
                            .coin_transaction_id(cs.coin.coin_id())
                            .await?
                            .is_some();

                        if !include_locked && in_transaction {
                            continue;
                        }

                        let is_offered =
                            wallet.db.coin_offer_id(cs.coin.coin_id()).await?.is_some();

                        if !include_locked && is_offered {
                            continue;
                        }

                        let Some(nft) = wallet.db.nft_by_coin_id(cs.coin.coin_id()).await? else {
                            return Err(Error::MissingCoin(cs.coin.coin_id()));
                        };

                        let synthetic_key =
                            wallet.db.synthetic_key(nft.info.p2_puzzle_hash).await?;

                        let mut ctx = SpendContext::new();
                        let p2_puzzle = CurriedProgram {
                            program: ctx.standard_puzzle()?,
                            args: StandardArgs::new(synthetic_key),
                        };
                        let nft_puzzle =
                            nft.info.into_layers(p2_puzzle).construct_puzzle(&mut ctx)?;

                        items.push(SpendableCoin {
                            coin: Coin {
                                parent_coin_info: hex::encode(cs.coin.parent_coin_info),
                                puzzle_hash: hex::encode(cs.coin.puzzle_hash),
                                amount: cs.coin.amount,
                            },
                            coin_name: hex::encode(cs.coin.coin_id()),
                            puzzle: hex::encode(ctx.serialize(&nft_puzzle)?),
                            confirmed_block_index: cs.created_height.expect("not created"),
                            locked: in_transaction || is_offered,
                            lineage_proof: Some(match nft.proof {
                                Proof::Lineage(proof) => LineageProof {
                                    parent_name: Some(hex::encode(proof.parent_parent_coin_info)),
                                    inner_puzzle_hash: Some(hex::encode(
                                        proof.parent_inner_puzzle_hash,
                                    )),
                                    amount: Some(proof.parent_amount),
                                },
                                Proof::Eve(proof) => LineageProof {
                                    parent_name: Some(hex::encode(proof.parent_parent_coin_info)),
                                    inner_puzzle_hash: None,
                                    amount: Some(proof.parent_amount),
                                },
                            }),
                        });
                    }
                }
            }
        } else {
            let rows = wallet
                .db
                .created_unspent_p2_coin_states(req.limit.unwrap_or(10), req.offset.unwrap_or(0))
                .await?;

            for row in rows {
                let cs = row.coin_state;

                let in_transaction = wallet
                    .db
                    .coin_transaction_id(cs.coin.coin_id())
                    .await?
                    .is_some();

                if !include_locked && in_transaction {
                    continue;
                }

                let is_offered = wallet.db.coin_offer_id(cs.coin.coin_id()).await?.is_some();

                if !include_locked && is_offered {
                    continue;
                }

                let synthetic_key = wallet.db.synthetic_key(cs.coin.puzzle_hash).await?;

                let mut ctx = SpendContext::new();
                let puzzle = CurriedProgram {
                    program: ctx.standard_puzzle()?,
                    args: StandardArgs::new(synthetic_key),
                };

                items.push(SpendableCoin {
                    coin: Coin {
                        parent_coin_info: hex::encode(cs.coin.parent_coin_info),
                        puzzle_hash: hex::encode(cs.coin.puzzle_hash),
                        amount: cs.coin.amount,
                    },
                    coin_name: hex::encode(cs.coin.coin_id()),
                    puzzle: hex::encode(ctx.serialize(&puzzle)?),
                    confirmed_block_index: cs.created_height.expect("not created"),
                    locked: in_transaction || is_offered,
                    lineage_proof: None,
                });
            }
        }

        Ok(items)
    }

    pub async fn sign_message_with_public_key(
        &self,
        req: SignMessageWithPublicKey,
    ) -> Result<SignMessageWithPublicKeyResponse> {
        let wallet = self.wallet()?;

        let public_key = parse_public_key(req.public_key)?;
        let Some(index) = wallet.db.synthetic_key_index(public_key).await? else {
            return Err(Error::InvalidKey);
        };

        let (_mnemonic, Some(master_sk)) =
            self.keychain.extract_secrets(wallet.fingerprint, b"")?
        else {
            return Err(Error::NoSigningKey);
        };

        let secret_key = master_to_wallet_unhardened(&master_sk, index).derive_synthetic();

        let signature = sign(
            &secret_key,
            ("Chia Signed Message", req.message).tree_hash(),
        );

        Ok(SignMessageWithPublicKeyResponse {
            signature: hex::encode(signature.to_bytes()),
        })
    }
}