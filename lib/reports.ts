import { jsPDF } from 'jspdf';

export function buildCsv(headers: string[], rows: string[][]): string {
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
  return [headers.map(escape).join(','), ...rows.map((row) => row.map(escape).join(','))].join('\n');
}

export function csvResponse(filename: string, content: string) {
  return new Response(content, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}

export function pdfResponse(filename: string, title: string, lines: string[]) {
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text(title, 14, 20);
  doc.setFontSize(11);

  let y = 32;
  for (const line of lines) {
    if (y > 280) {
      doc.addPage();
      y = 20;
    }
    doc.text(line, 14, y);
    y += 8;
  }

  const buffer = doc.output('arraybuffer');
  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}

export function getReportFormat(searchParams: URLSearchParams) {
  const format = searchParams.get('format');
  if (format !== 'pdf' && format !== 'csv') {
    return null;
  }
  return format;
}
