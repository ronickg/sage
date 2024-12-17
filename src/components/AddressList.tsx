import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo } from 'react';
import { Button } from './ui/button';
import { CopyButton } from './CopyButton';
import { FormattedAddress } from './FormattedAddress';

export interface AddressListProps {
  addresses: string[];
}

interface AddressRow {
  id: number;
  address: string;
}

export default function AddressList(props: AddressListProps) {
  const rows = useMemo(() => {
    return props.addresses.map((address, i) => ({
      id: i,
      address,
    }));
  }, [props.addresses]);

  const columns: ColumnDef<AddressRow>[] = [
    {
      id: 'id',
      accessorFn: (row) => row.id,
      header: () => <div className='text-center'>Index</div>,
      cell: (info) => (
        <div className='text-center w-14'>{info.row.original.id}</div>
      ),
    },
    {
      id: 'address',
      accessorFn: (row) => row.address,
      header: 'Address',
      cell: (info) => (
        <div className='w-full overflow-hidden'>
          <FormattedAddress address={info.getValue() as string} />
        </div>
      ),
    },
    {
      id: 'actions',
      header: () => <div className='text-center'>Actions</div>,
      cell: (info) => (
        <div className='w-16 text-center'>
          <CopyButton
            value={info.row.original.address}
            className='flex-shrink-0'
          />
        </div>
      ),
    },
  ];

  const defaultColumn: Partial<ColumnDef<AddressRow>> = {
    minSize: 70,
    size: 200,
    maxSize: 1000,
  };

  const table = useReactTable({
    data: rows,
    columns,
    defaultColumn,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    columnResizeMode: 'onChange',
    initialState: {
      pagination: {
        pageSize: 10,
      },
    },
  });

  return (
    <div className='flex flex-col h-full'>
      <div className='flex-shrink overflow-auto'>
        <div className='rounded-md border'>
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      style={
                        header.column.id === 'address'
                          ? { maxWidth: 200 }
                          : {
                              width: header.column.getSize(),
                            }
                      }
                      className={
                        header.column.id === 'address' ? 'w-full' : undefined
                      }
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        style={
                          cell.column.id === 'address'
                            ? { maxWidth: 200 }
                            : {
                                width: cell.column.getSize(),
                              }
                        }
                        className={
                          cell.column.id === 'address' ? 'w-full' : undefined
                        }
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className='h-24 text-center'
                  >
                    No results.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
      <div className='flex-shrink-0 flex items-center justify-end space-x-2 py-4'>
        <Button
          variant='outline'
          size='sm'
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
        >
          <ChevronLeft className='h-4 w-4' />
        </Button>
        <Button
          variant='outline'
          size='sm'
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
        >
          <ChevronRight className='h-4 w-4' />
        </Button>
      </div>
    </div>
  );
}
