import Container from '@/components/Container';
import Header from '@/components/Header';
import { ReceiveAddress } from '@/components/ReceiveAddress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { ArrowDownAz, InfoIcon, ArrowDown10 } from 'lucide-react';
import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { CatRecord, commands, events } from '../bindings';
import { useWalletState } from '../state';
import {
  DropdownMenuItem,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { usePrices } from '@/contexts/PriceContext';
import { useTokenParams } from '@/hooks/useTokenParams';

enum TokenView {
  Name = 'name',
  Balance = 'balance',
}

export function TokenList() {
  const walletState = useWalletState();
  const { getBalanceInUsd } = usePrices();

  const [params, setParams] = useTokenParams();
  const { view, showHidden } = params;

  const [cats, setCats] = useState<CatRecord[]>([]);

  const catsWithBalanceInUsd = useMemo(
    () =>
      cats.map((cat) => ({
        ...cat,
        balanceInUsd: getBalanceInUsd(cat.asset_id, cat.balance),
      })),
    [cats, getBalanceInUsd],
  );

  const sortedCats = catsWithBalanceInUsd.sort((a, b) => {
    if (a.visible && !b.visible) {
      return -1;
    }

    if (!a.visible && b.visible) {
      return 1;
    }

    if (!a[view] && b[view]) {
      return -1;
    }

    if (a[view] && !b[view]) {
      return 1;
    }

    if (!a[view] && !b[view]) {
      return 0;
    }

    if (view === TokenView.Balance) {
      return Number(b.balanceInUsd) - Number(a.balanceInUsd);
    }

    return a.name!.localeCompare(b.name!);
  });

  const visibleCats = sortedCats.filter((cat) => showHidden || cat.visible);
  const hasHiddenAssets = !!sortedCats.find((cat) => !cat.visible);

  const updateCats = () => {
    commands.getCats().then(async (result) => {
      if (result.status === 'ok') {
        setCats(result.data);
      }
    });
  };

  useEffect(() => {
    updateCats();

    const unlisten = events.syncEvent.listen((event) => {
      const type = event.payload.type;

      if (
        type === 'coin_state' ||
        type === 'puzzle_batch_synced' ||
        type === 'cat_info'
      ) {
        updateCats();
      }
    });

    return () => {
      unlisten.then((u) => u());
    };
  }, []);

  return (
    <>
      <Header title='Assets'>
        <div className='flex items-center gap-2'>
          <TokenSortDropdown
            view={view}
            setView={(view) => setParams({ view })}
          />
          <ReceiveAddress />
        </div>
      </Header>
      <Container>
        {walletState.sync.synced_coins < walletState.sync.total_coins && (
          <Alert className='mt-2 mb-4'>
            <InfoIcon className='h-4 w-4' />
            <AlertTitle>Syncing in progress...</AlertTitle>
            <AlertDescription>
              The wallet is still syncing. Balances may not be accurate until it
              completes.
            </AlertDescription>
          </Alert>
        )}

        {hasHiddenAssets && (
          <div className='inline-flex items-center gap-2 mb-4'>
            <label htmlFor='viewHidden'>View hidden</label>
            <Switch
              id='viewHidden'
              checked={showHidden}
              onCheckedChange={(value) => setParams({ showHidden: value })}
            />
          </div>
        )}

        <div className='grid gap-2 md:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'>
          <Link to={`/wallet/token/xch`}>
            <Card className='transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-900'>
              <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                <CardTitle className='text-md font-medium'>Chia</CardTitle>

                <img
                  alt={`XCH logo`}
                  className='h-6 w-6'
                  src='https://icons.dexie.space/xch.webp'
                />
              </CardHeader>
              <CardContent>
                <div className='text-2xl font-medium truncate'>
                  {walletState.sync.balance}
                </div>
                <div className='text-sm text-neutral-500'>
                  ~${getBalanceInUsd('xch', walletState.sync.balance)}
                </div>
              </CardContent>
            </Card>
          </Link>
          {visibleCats.map((cat) => (
            <Link key={cat.asset_id} to={`/wallet/token/${cat.asset_id}`}>
              <Card
                className={`transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-900 ${!cat.visible ? 'opacity-50 grayscale' : ''}`}
              >
                <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2 space-x-2'>
                  <CardTitle className='text-md font-medium truncate'>
                    {cat.name || 'Unknown CAT'}
                  </CardTitle>

                  {cat.icon_url && (
                    <img
                      alt={`${cat.asset_id} logo`}
                      className='h-6 w-6'
                      src={cat.icon_url}
                    />
                  )}
                </CardHeader>
                <CardContent>
                  <div className='text-2xl font-medium truncate'>
                    {cat.balance} {cat.ticker ?? ''}
                  </div>

                  <div className='text-sm text-neutral-500'>
                    ~${cat.balanceInUsd}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </Container>
    </>
  );
}

function TokenSortDropdown({
  view,
  setView,
}: {
  view: TokenView;
  setView: (view: TokenView) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant='outline' size='icon'>
          {view === TokenView.Balance ? (
            <ArrowDown10 className='h-4 w-4' />
          ) : (
            <ArrowDownAz className='h-4 w-4' />
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align='end'>
        <DropdownMenuGroup>
          <DropdownMenuItem
            className='cursor-pointer'
            onClick={(e) => {
              e.stopPropagation();
              setView(TokenView.Name);
            }}
          >
            <ArrowDownAz className='mr-2 h-4 w-4' />
            <span>Sort Alphabetically</span>
          </DropdownMenuItem>

          <DropdownMenuItem
            className='cursor-pointer'
            onClick={(e) => {
              e.stopPropagation();
              setView(TokenView.Balance);
            }}
          >
            <ArrowDown10 className='mr-2 h-4 w-4' />
            <span>Sort by Balance</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}