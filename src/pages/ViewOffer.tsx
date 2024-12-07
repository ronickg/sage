import { commands, Error, OfferSummary, TakeOfferResponse } from '@/bindings';
import ConfirmationDialog from '@/components/ConfirmationDialog';
import Container from '@/components/Container';
import ErrorDialog from '@/components/ErrorDialog';
import Header from '@/components/Header';
import { OfferCard } from '@/components/OfferCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toDecimal, toMojos } from '@/lib/utils';
import { useWalletState } from '@/state';
import BigNumber from 'bignumber.js';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

export function ViewOffer() {
  const { offer } = useParams();

  const walletState = useWalletState();
  const navigate = useNavigate();

  const [summary, setSummary] = useState<OfferSummary | null>(null);
  const [response, setResponse] = useState<TakeOfferResponse | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [fee, setFee] = useState('');

  useEffect(() => {
    if (!offer) return;

    commands.viewOffer({ offer }).then((result) => {
      if (result.status === 'error') {
        setError(result.error);
      } else {
        setSummary(result.data.offer);
      }
    });
  }, [offer]);

  const importOffer = () => {
    commands.importOffer({ offer: offer! }).then((result) => {
      if (result.status === 'error') {
        setError(result.error);
      } else {
        navigate('/offers');
      }
    });
  };

  const take = () => {
    commands.importOffer({ offer: offer! }).then((result) => {
      if (result.status === 'error') {
        setError(result.error);
        return;
      }

      commands
        .takeOffer({
          offer: offer!,
          fee: toMojos(fee || '0', walletState.sync.unit.decimals),
        })
        .then((result) => {
          if (result.status === 'error') {
            setError(result.error);
          } else {
            setResponse(result.data);
          }
        });
    });
  };

  return (
    <>
      <Header title='View Offer' />

      <Container>
        {summary && (
          <OfferCard summary={summary}>
            <div className='flex flex-col space-y-1.5'>
              <Label htmlFor='fee'>Network Fee</Label>
              <Input
                id='fee'
                type='text'
                placeholder='0.00'
                className='pr-12'
                value={fee}
                onChange={(e) => setFee(e.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    take();
                  }
                }}
              />

              <span className='text-xs text-muted-foreground'>
                {BigNumber(summary?.fee ?? '0').isGreaterThan(0)
                  ? `This does not include a fee of ${toDecimal(summary!.fee, walletState.sync.unit.decimals)} which was already added by the maker.`
                  : ''}
              </span>
            </div>
          </OfferCard>
        )}

        <div className='mt-4 flex gap-2'>
          <Button variant='outline' onClick={importOffer}>
            Save Offer
          </Button>

          <Button onClick={take}>Take Offer</Button>
        </div>

        <ErrorDialog
          error={error}
          setError={(error) => {
            setError(error);
            if (error === null) navigate('/offers');
          }}
        />
      </Container>

      <ConfirmationDialog
        response={response}
        close={() => setResponse(null)}
        onConfirm={() => navigate('/offers')}
      />
    </>
  );
}
