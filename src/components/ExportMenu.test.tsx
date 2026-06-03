import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ExportMenu from './ExportMenu';
import { useRoundStore } from '@/lib/store/useRoundStore';
import { makeFormatByKey } from '@/lib/format/presets';

vi.mock('@/lib/persistence/io', () => ({ downloadRoundFile: vi.fn() }));
vi.mock('@/lib/export/xlsx', () => ({ downloadXlsx: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/export/pdf', () => ({ downloadPdf: vi.fn().mockResolvedValue(undefined) }));

beforeEach(() => {
  useRoundStore.getState().createRound({ role: 'aff', format: makeFormatByKey('policy'), meta: {} });
});

describe('ExportMenu', () => {
  it('opens on click and exposes the three formats', () => {
    render(<ExportMenu />);
    fireEvent.click(screen.getByTestId('export-btn'));
    expect(screen.getByTestId('export-json')).toBeInTheDocument();
    expect(screen.getByTestId('export-excel')).toBeInTheDocument();
    expect(screen.getByTestId('export-pdf')).toBeInTheDocument();
  });

  it('JSON item invokes downloadRoundFile', async () => {
    const { downloadRoundFile } = await import('@/lib/persistence/io');
    render(<ExportMenu />);
    fireEvent.click(screen.getByTestId('export-btn'));
    fireEvent.click(screen.getByTestId('export-json'));
    expect(downloadRoundFile).toHaveBeenCalled();
  });

  it('Excel item invokes downloadXlsx', async () => {
    const { downloadXlsx } = await import('@/lib/export/xlsx');
    render(<ExportMenu />);
    fireEvent.click(screen.getByTestId('export-btn'));
    fireEvent.click(screen.getByTestId('export-excel'));
    expect(downloadXlsx).toHaveBeenCalled();
  });
});
