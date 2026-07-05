import type { HalexInvoice, HalexInvoiceItem } from "./halex-bulk-empenho";
import { parseQuotationPriceInput } from "./quotation-price.ts";

// Shared pt-BR number parser: "R$ 1.234,56" reads as 1234.56 instead of NaN/0.
const numberValue = parseQuotationPriceInput;

function isoDate(value: string) {
  const match = value.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return match ? `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}` : "";
}

function clean(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function parseItems(block: string): HalexInvoiceItem[] {
  return block.split("\n").flatMap((raw): HalexInvoiceItem[] => {
    const line = clean(raw).replace(/[—_]+/g, " ");
    const match = line.match(
      /^(\d{3,9})\.?\s+(.+?)\s+(\d+(?:[.,]\d+)?)\s+R\$\s*([\d.,]+)\s+R\$\s*([\d.,]+)\s+(\d+(?:[.,]\d+)?)\s+R\$\s*([\d.,]+)$/i,
    );
    if (!match) return [];
    return [{
      codigoProduto: match[1],
      descricao: clean(match[2]),
      quantidadeCaixas: 0,
      quantidade: numberValue(match[6]),
      valorUnitario: numberValue(match[4]),
      valorTotal: numberValue(match[7]),
    }];
  });
}

export function parseBillingReportOcr(text: string): HalexInvoice[] {
  const starts = [...text.matchAll(/Ordem de venda\s+(\d+)/gi)];
  return starts.flatMap((start, index): HalexInvoice[] => {
    const orderNumber = start[1];
    const block = text.slice(start.index, starts[index + 1]?.index ?? text.length);
    const client = block.match(/Cliente\s+(.+?)\s+Tipo de Ordem/i)?.[1];
    const sapOrder = block.match(/Origem de Venda SAP:\s*0*(\d+)/i)?.[1];
    const invoice = block.match(/NFe:\s*0*(\d+)\s*-\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);
    if (!client || !sapOrder || !invoice) return [];
    const customerOrder = block.match(/Pedido Cliente\s*(.*?)(?=\s+Data Criação|\n)/i)?.[1] || "";
    const created = block.match(/Data Criação\s*(\d{1,2}\/\d{1,2}\/\d{4})/i)?.[1] || "";
    const items = parseItems(block);
    return [{
      key: `PDF|${invoice[1]}`,
      numeroEmpenho: `OV ${orderNumber}`,
      nf: invoice[1],
      dataEmpenho: isoDate(created),
      dataFaturamento: isoDate(invoice[2]),
      ordemVenda: sapOrder,
      codigoCliente: "",
      nomeCliente: clean(client),
      items,
      pedidoCliente: clean(customerOrder),
    } as HalexInvoice];
  });
}
