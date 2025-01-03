import useInitialization from '@/hooks/useInitialization';
import { usePeers } from '@/hooks/usePeers';
import { useWallet } from '@/hooks/useWallet';
import icon from '@/icon.png';
import { logoutAndUpdateState, useWalletState } from '@/state';
import { ChevronLeft, Cog, LogOut, Menu } from 'lucide-react';
import { PropsWithChildren, ReactNode, useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Plural, Trans } from '@lingui/react/macro';
import { t } from '@lingui/core/macro';
import { Nav } from './Nav';
import { Button } from './ui/button';
import { Sheet, SheetContent, SheetTrigger } from './ui/sheet';
import { platform } from '@tauri-apps/plugin-os';
import { useInsets } from '@/contexts/SafeAreaContext';

export default function Header(
  props: PropsWithChildren<{
    title: string | ReactNode;
    back?: () => void;
    children?: ReactNode;
  }>,
) {
  const navigate = useNavigate();
  const location = useLocation();
  const insets = useInsets();

  const initialized = useInitialization();
  const wallet = useWallet(initialized);

  const { peers } = usePeers();
  const peerCount = peers?.length || 0;

  const walletState = useWalletState();
  const syncedCoins = walletState.sync.synced_coins;
  const totalCoins = walletState.sync.total_coins;
  const isSynced = useMemo(
    () => walletState.sync.synced_coins === walletState.sync.total_coins,
    [walletState.sync.synced_coins, walletState.sync.total_coins],
  );

  const peerMaxHeight =
    peers?.reduce((max, peer) => {
      return Math.max(max, peer.peak_height);
    }, 0) || 0;

  const logout = () => {
    logoutAndUpdateState().then(() => {
      navigate('/');
    });
  };

  const hasBackButton = props.back || location.pathname.split('/').length > 2;
  const isMobile = platform() === 'ios' || platform() === 'android';

  return (
    <header className='flex items-center gap-4 px-4 md:px-6 sticky top-0 bg-background z-10 pb-2 pt-2'>
      <Sheet>
        {hasBackButton ? (
          <Button
            variant='outline'
            size='icon'
            onClick={() => (props.back ? props.back() : navigate(-1))}
            className='md:hidden text-muted-foreground'
            aria-label={t`Back`}
          >
            <ChevronLeft className='h-5 w-5 pb' aria-hidden='true' />
            <span className='sr-only'>
              <Trans>Back</Trans>
            </span>
          </Button>
        ) : (
          <SheetTrigger asChild>
            <Button
              variant='outline'
              size='icon'
              className='shrink-0 md:hidden'
              aria-label={t`Toggle navigation menu`}
            >
              <Menu className='h-5 w-5' aria-hidden='true' />
              <span className='sr-only'>
                <Trans>Toggle navigation menu</Trans>
              </span>
            </Button>
          </SheetTrigger>
        )}
        <SheetContent
          side='left'
          isMobile={isMobile}
          className='flex flex-col'
          style={{
            paddingTop:
              insets.top !== 0 ? `${insets.top}px` : 'env(safe-area-inset-top)',
          }}
        >
          <div className='flex h-14 items-center'>
            <Link
              to='/wallet'
              className='flex items-center gap-2 font-semibold'
              aria-label={t`Go to wallet`}
            >
              <img src={icon} className='h-8 w-8' alt={t`Wallet icon`} />
              <span className='text-lg'>{wallet?.name}</span>
            </Link>
          </div>
          <div className='-mx-2'>
            <Nav />
          </div>
          <nav className='mt-auto grid gap-1 text-md font-medium'>
            <Link
              to='/peers'
              className='mx-[-0.65rem] flex items-center gap-4 rounded-xl px-3 py-2 text-muted-foreground hover:text-foreground'
              aria-label={t`Network status`}
            >
              <span
                className={
                  'inline-flex h-3 w-3 m-0.5 rounded-full' +
                  ' ' +
                  (isSynced ? 'bg-emerald-600' : 'bg-yellow-600')
                }
                aria-hidden='true'
              ></span>
              {isSynced ? (
                <>
                  <Plural value={peerCount} one={'# peer'} other={'# peers'} />{' '}
                  {peerMaxHeight
                    ? t`at peak ${peerMaxHeight}`
                    : t`connecting...`}
                </>
              ) : (
                <Trans>
                  Syncing {syncedCoins} / {totalCoins}
                </Trans>
              )}
            </Link>
            <Link
              to='/settings'
              className='mx-[-0.65rem] flex items-center gap-4 rounded-xl px-3 py-2 text-muted-foreground hover:text-foreground'
            >
              <Cog className='h-4 w-4' aria-hidden='true' />
              <Trans>Settings</Trans>
            </Link>
            <button
              onClick={logout}
              className='mx-[-0.65rem] flex items-center gap-4 rounded-xl px-3 py-2 text-muted-foreground hover:text-foreground'
            >
              <LogOut className='h-4 w-4' aria-hidden='true' />
              <Trans>Logout</Trans>
            </button>
          </nav>
        </SheetContent>
      </Sheet>
      <div className='flex-1 md:mt-2 flex items-center md:block'>
        {hasBackButton ? (
          <>
            <Button
              variant='link'
              size='sm'
              onClick={() => (props.back ? props.back() : navigate(-1))}
              className='hidden md:flex px-0 text-muted-foreground'
            >
              <ChevronLeft className='h-4 w-4 mr-1' aria-hidden='true' />
              <Trans>Back</Trans>
            </Button>
          </>
        ) : (
          <div className='md:h-8'></div>
        )}
        <div className='flex-1 flex justify-between items-center gap-4 md:h-9 md:my-2'>
          <h1 className='text-xl font-bold tracking-tight md:text-3xl'>
            {props.title}
          </h1>
          <div className='hidden md:block'>{props.children}</div>
        </div>
      </div>
    </header>
  );
}
