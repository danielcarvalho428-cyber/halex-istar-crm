"use client";

import { Suspense, useCallback, useMemo, useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { FileDown, Plus, Printer, Search, Trash2 } from "lucide-react";
import { useAppUX } from "@/components/AppUX";
import {
  appDate,
  money,
  previewClients,
} from "@/lib/crm-preview";
import {
  useDesktopClients,
  useDesktopAgreements,
  useDesktopLetterhead,
  useDesktopProducts,
  useDesktopSalesPriceTable,
  useDesktopSalesPriceTableMedicone,
} from "@/lib/use-desktop-data";
import { agreementPriceFor } from "@/lib/agreement-pricing";
import {
  formatQuotationPriceInput,
  parseQuotationPriceInput,
} from "@/lib/quotation-price";
import {
  estimatedProductRowHeight,
  paginateQuotationRows,
} from "@/lib/quotation-pagination";
import {
  isFullBoxQuantity,
  quotationDisplayUnitPrice,
  quotationCurrencyValue,
  quotationLineDisplayTotal,
  quotationLineUnits,
  quotationPriceDraftKey,
  quotationUnitPriceFromDisplay,
} from "@/lib/quotation-quantity";
import {
  DEFAULT_SALES_PRICE_TABLE,
  DEFAULT_SALES_PRICE_REGION,
  isSalesPriceRegion,
  isSalesPriceTable,
  SALES_PRICE_REGIONS,
  SALES_PRICE_TABLES,
  type SalesPriceTable,
  type SalesPriceRegion,
} from "@/lib/sales-price-table";

type QuoteLine = { productId: string; quantity: number; unitPrice: number; brand?: string; quantityMode?: "boxes" | "units"; unitQuantity?: number };

// Shape of the debounced autosave written to localStorage while a quote is
// being built, so an interrupted session (crash, accidental close) can be
// recovered instead of silently lost.
type QuoteDraft = {
  clientId?: string;
  lines?: QuoteLine[];
  validDays?: number;
  payment?: string;
  delivery?: string;
  seller?: string;
  freight?: string;
  notes?: string;
  quoteNumber?: string;
  savedAt?: string;
};

type StoredQuoteItem = {
  product_id: string;
  quantity: number;
  unit_price: number;
  brand?: string;
  quantity_mode?: "boxes" | "units";
  unit_quantity?: number;
};

type StoredQuote = {
  id: string;
  quote_number?: string;
  client_id: string;
  seller?: string;
  representative_role?: string;
  representative_phone?: string;
  representative_email?: string;
  sales_price_table?: string;
  sales_price_region?: string;
  payment_terms?: string;
  delivery_terms?: string;
  freight_terms?: string;
  notes?: string;
  issued_at?: string;
  valid_until?: string;
  items?: StoredQuoteItem[];
};

type RepresentativeDetails = {
  email: string;
  role: string;
  phone: string;
};

// Local-time YYYY-MM-DD so the stored/printed date matches the quote number's
// local day instead of shifting a day forward near midnight (UTC-3).
function toDateInput(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

const PAYMENT_PRESETS = ["28/42/56 Dias", "30/45/60 Dias", "30 Dias", "À vista"];

type BillingBrand = "Halex Istar" | "Medicone";

// The two invoicing brands. A product's brand decides which one a line belongs
// to; a quote mixing both is split into one document per brand at export time.
function normalizeBillingBrand(value: string | undefined | null): BillingBrand {
  return value === "Medicone" ? "Medicone" : "Halex Istar";
}

// Per-brand presentation for the fallback header/footer used when a brand has no
// letterhead image configured.
const BRAND_IDENTITY: Record<BillingBrand, { name: string; subtitle: string; mark: string; footer: string; prefix: string }> = {
  "Halex Istar": {
    name: "HALEX ISTAR",
    subtitle: "Indústria farmacêutica",
    mark: "HI",
    footer: "Halex Istar Indústria Farmacêutica S/A",
    prefix: "HI",
  },
  Medicone: {
    name: "MEDICONE",
    subtitle: "Material hospitalar",
    mark: "MC",
    footer: "Medicone Material Hospitalar",
    prefix: "MC",
  },
};

function Builder() {
  const params = useSearchParams();
  const editId = params.get("editId");
  const clients = useDesktopClients();
  const products = useDesktopProducts();
  const agreements = useDesktopAgreements();
  const letterhead = useDesktopLetterhead();
  const mediconeLetterhead = useDesktopLetterhead("Medicone");
  const importedSalesPriceTable = useDesktopSalesPriceTable();
  const importedMediconeTable = useDesktopSalesPriceTableMedicone();
  const { toast } = useAppUX();
  const [saving, setSaving] = useState(false);
  const [lastDraftAt, setLastDraftAt] = useState<Date | null>(null);
  const [pendingDraft, setPendingDraft] = useState<QuoteDraft | null>(null);
  const [clientId, setClientId] = useState(
    params.get("cliente") || previewClients[0].id,
  );
  const [lines, setLines] = useState<QuoteLine[]>([]);
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [validDays, setValidDays] = useState(15);
  const [payment, setPayment] = useState("30/45/60 Dias");
  const [paymentIsCustom, setPaymentIsCustom] = useState(false);
  const [hidePrices, setHidePrices] = useState(false);
  const [delivery, setDelivery] = useState(
    "Até 10 dias úteis após confirmação",
  );
  const [seller, setSeller] = useState("Paulo Roberto");
  const [freight, setFreight] = useState("CIF - incluso no valor da proposta");
  const [notes, setNotes] = useState(
    "Preços expressos em reais. Produtos sujeitos à disponibilidade no momento da confirmação do pedido.",
  );
  const [representative, setRepresentative] = useState<RepresentativeDetails>({
    email: "",
    role: "Representante comercial",
    phone: "",
  });
  const [representativeLoaded, setRepresentativeLoaded] = useState(false);
  const [issued, setIssued] = useState(() => new Date());
  const [quoteNumber, setQuoteNumber] = useState(() => {
    const now = new Date();
    return `HI-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
  });
  const [notice, setNotice] = useState("");
  const [salesPriceTable, setSalesPriceTable] = useState<SalesPriceTable>(
    DEFAULT_SALES_PRICE_TABLE,
  );
  const [salesPriceRegion, setSalesPriceRegion] = useState<SalesPriceRegion>(
    DEFAULT_SALES_PRICE_REGION,
  );
  // Once a new quotation is saved, reuse its id so a follow-up save (e.g. "Gerar
  // PDF" after "Salvar") updates the same row instead of colliding on the
  // UNIQUE quote_number.
  const [savedId, setSavedId] = useState<string | null>(editId);
  // While null the preview shows every line (editing). During the two-PDF export
  // it is flipped to each brand in turn so the on-screen pages — which printToPDF
  // captures — contain only that brand's items and its letterhead.
  const [printBrand, setPrintBrand] = useState<BillingBrand | null>(null);

  useEffect(() => {
    if (editId || lines.length === 0) return;
    const timer = window.setTimeout(() => {
      localStorage.setItem("quotationWorkingDraft", JSON.stringify({ clientId, lines, validDays, payment, delivery, seller, freight, notes, quoteNumber, savedAt: new Date().toISOString() }));
      setLastDraftAt(new Date());
    }, 650);
    return () => window.clearTimeout(timer);
  }, [clientId, delivery, editId, freight, lines, notes, payment, quoteNumber, seller, validDays]);

  useEffect(() => {
    if (lines.length === 0 || savedId) return;
    const protectDraft = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Some browsers still require returnValue to actually show the prompt.
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", protectDraft);
    return () => window.removeEventListener("beforeunload", protectDraft);
  }, [lines.length, savedId]);

  // Offer to recover an interrupted draft. Runs once on mount for a brand-new
  // quote (never when editing a saved one), before the autosave effect can
  // overwrite the stored draft (it only writes once lines exist).
  useEffect(() => {
    if (editId) return;
    try {
      const raw = localStorage.getItem("quotationWorkingDraft");
      if (!raw) return;
      const parsed = JSON.parse(raw) as QuoteDraft;
      if (Array.isArray(parsed?.lines) && parsed.lines.length > 0) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setPendingDraft(parsed);
      }
    } catch {}
  }, [editId]);

  const resumeDraft = () => {
    const draft = pendingDraft;
    if (!draft) return;
    if (typeof draft.clientId === "string") setClientId(draft.clientId);
    if (Array.isArray(draft.lines)) setLines(draft.lines);
    if (typeof draft.validDays === "number") setValidDays(draft.validDays);
    if (typeof draft.payment === "string") {
      setPayment(draft.payment);
      setPaymentIsCustom(!PAYMENT_PRESETS.includes(draft.payment));
    }
    if (typeof draft.delivery === "string") setDelivery(draft.delivery);
    if (typeof draft.seller === "string") setSeller(draft.seller);
    if (typeof draft.freight === "string") setFreight(draft.freight);
    if (typeof draft.notes === "string") setNotes(draft.notes);
    if (typeof draft.quoteNumber === "string") setQuoteNumber(draft.quoteNumber);
    setPendingDraft(null);
  };

  const discardDraft = () => {
    localStorage.removeItem("quotationWorkingDraft");
    setPendingDraft(null);
  };

  useEffect(() => {
    if (editId || savedId) return;
    const syncWithSystemClock = () => setIssued(new Date());
    syncWithSystemClock();
    const timer = window.setInterval(syncWithSystemClock, 60_000);
    return () => window.clearInterval(timer);
  }, [editId, savedId]);

  // These refs let the repricing effects tell a genuine user change (pick a new
  // client/table) apart from a programmatic load of a stored quote. loadQuotation
  // seeds them with the loaded values so it does NOT trigger a reprice.
  const prevClientIdRef = useRef(clientId);
  const initialAgreementAppliedRef = useRef(false);
  const previousSalesPriceTableRef = useRef(salesPriceTable);
  const previousSalesPriceRegionRef = useRef(salesPriceRegion);

  useEffect(() => {
    queueMicrotask(() => {
      const saved = localStorage.getItem("quotationRepresentative");
      if (saved) {
        try {
          const parsed = JSON.parse(saved) as Partial<RepresentativeDetails> & { name?: string };
          setSeller(parsed.name || "Paulo Roberto");
          setRepresentative({
            email: parsed.email || "",
            role: parsed.role || "Representante comercial",
            phone: parsed.phone || "",
          });
        } catch {}
      }
      setRepresentativeLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (!representativeLoaded) return;
    localStorage.setItem("quotationRepresentative", JSON.stringify({
      name: seller,
      ...representative,
    }));
  }, [representative, representativeLoaded, seller]);

  useEffect(() => {
    if (!editId) return;
    async function loadQuotation() {
      let quote: StoredQuote | null = null;
      if (window.halexDesktop) {
        quote = await window.halexDesktop.quotations.get(editId!) as StoredQuote | null;
      } else {
        const stored = localStorage.getItem("manualQuotations");
        const parsed: StoredQuote[] = stored ? JSON.parse(stored) : [];
        quote = parsed.find((item) => String(item.id) === editId) || null;
      }
      if (quote) {
          queueMicrotask(() => {
            setClientId(quote.client_id);
            if (quote.quote_number) setQuoteNumber(quote.quote_number);
            if (quote.issued_at) setIssued(new Date(`${quote.issued_at}T12:00:00`));
            setSeller(quote.seller || "Paulo Roberto");
            setRepresentative({
              email: quote.representative_email || "",
              role: quote.representative_role || "Representante comercial",
              phone: quote.representative_phone || "",
            });
            if (isSalesPriceTable(quote.sales_price_table)) {
              setSalesPriceTable(quote.sales_price_table);
              previousSalesPriceTableRef.current = quote.sales_price_table;
            }
            if (isSalesPriceRegion(quote.sales_price_region)) {
              setSalesPriceRegion(quote.sales_price_region);
              previousSalesPriceRegionRef.current = quote.sales_price_region;
            }
            // Keep the loaded prices exactly as saved — sync the client ref so
            // the client-change effect doesn't recalculate them from the table.
            prevClientIdRef.current = quote.client_id;
            const loadedPayment = quote.payment_terms || "30/45/60 Dias";
            setPayment(loadedPayment);
            setPaymentIsCustom(!PAYMENT_PRESETS.includes(loadedPayment));
            setDelivery(
              quote.delivery_terms || "Até 10 dias úteis após confirmação",
            );
            setFreight(
              quote.freight_terms || "CIF - incluso no valor da proposta",
            );
            setNotes(quote.notes || "");

            if (quote.issued_at && quote.valid_until) {
              const issuedDate = new Date(`${quote.issued_at}T12:00:00`);
              const validDate = new Date(`${quote.valid_until}T12:00:00`);
              const diffTime = Math.abs(
                validDate.getTime() - issuedDate.getTime(),
              );
              setValidDays(Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
            }

            if (quote.items) {
              setLines(
                quote.items.map((item) => ({
                  productId: item.product_id,
                  quantity: item.quantity,
                  unitPrice: item.unit_price,
                  brand: item.brand || "",
                  quantityMode: item.quantity_mode || "boxes",
                  unitQuantity: item.unit_quantity,
                })),
              );
            }
          });
      }
    }
    void loadQuotation();
  }, [editId]);

  // O(1) lookups so per-row pricing in the catalog doesn't scan the whole
  // product/client list on every render (the catalog can hold 1-2k products).
  const productById = useMemo(
    () => new Map(products.map((item) => [item.id, item])),
    [products],
  );
  const clientById = useMemo(
    () => new Map(clients.map((item) => [item.id, item])),
    [clients],
  );

  // The initial clientId is a preview id; once the real client list loads, snap
  // to the first real client so the dropdown reflects a valid, selectable choice.
  useEffect(() => {
    if (editId) return;
    if (clients.length === 0) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!clientById.has(clientId)) setClientId(clients[0].id);
  }, [editId, clients, clientById, clientId]);

  // The Medicone quantity-break faixa that applies to a given code, client tier
  // and total units — or null when the product has no faixas.
  const mediconeTier = useCallback(
    (code: string, isDistribuidor: boolean, units: number) => {
      const faixas = importedMediconeTable?.tiers?.[isDistribuidor ? "distribuidor" : "hospital"]?.[code];
      if (!Array.isArray(faixas) || faixas.length === 0) return null;
      const quantity = Math.max(1, units);
      return (
        faixas.find((faixa) => quantity >= faixa.min && (faixa.max == null || quantity <= faixa.max)) ??
        faixas[faixas.length - 1]
      );
    },
    [importedMediconeTable],
  );

  const priceForClient = useCallback((productId: string, selectedClientId = clientId, units = 1) => {
    const product = productById.get(productId);
    if (!product) return 0;
    const selectedClient = clientById.get(selectedClientId);
    const isDistribuidor = selectedClient?.clientType === "distribuidor";
    const legacyPrice = isDistribuidor
      ? (product.priceDistribuidor ?? product.price)
      : (product.priceHospital ?? product.price);
    // Medicone has a single table with two tiers (hospital / distribuidor) chosen
    // by the client type; quantity-break faixas override the base tier price when
    // the ordered units reach a breakpoint. Halex Istar uses region × category.
    let importedPrice: number | undefined;
    if (normalizeBillingBrand(product.brand) === "Medicone") {
      const tier = mediconeTier(product.code, isDistribuidor, units);
      importedPrice = tier
        ? tier.price
        : importedMediconeTable?.prices?.default?.[isDistribuidor ? "distribuidor" : "hospital"]?.[product.code];
    } else {
      importedPrice = importedSalesPriceTable?.prices?.[salesPriceRegion]?.[salesPriceTable]?.[product.code];
    }
    // No baked-in price table: use the imported (current) table, else the
    // product's own catalog price — never a hardcoded, silently-stale value.
    const fallbackPrice = importedPrice ?? legacyPrice;
    return agreementPriceFor(
      agreements,
      selectedClientId,
      product.code,
      fallbackPrice,
    );
  }, [agreements, clientId, clientById, importedSalesPriceTable, importedMediconeTable, mediconeTier, productById, salesPriceRegion, salesPriceTable]);

  // Total units currently on a line, used to resolve the Medicone faixa.
  const lineUnits = useCallback(
    (line: QuoteLine) => {
      const packSize = Math.max(1, productById.get(line.productId)?.packSize || 1);
      return quotationLineUnits(line.quantityMode, line.quantity, line.unitQuantity, packSize);
    },
    [productById],
  );

  // Automatically update prices in the cart when client changes (Hospital vs Distribuidor)
  useEffect(() => {
    if (prevClientIdRef.current !== clientId) {
      prevClientIdRef.current = clientId;
      if (products.length === 0 || clients.length === 0) return;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPriceDrafts({});
      setLines((current) =>
        current.map((line) => {
          const product = productById.get(line.productId);
          return {
            ...line,
            unitPrice: priceForClient(line.productId, clientId, lineUnits(line)),
            brand: line.brand || product?.brand || "",
          };
        })
      );
    }
  }, [clientId, products, clients, productById, agreements, priceForClient, lineUnits]);

  useEffect(() => {
    if (
      previousSalesPriceTableRef.current === salesPriceTable &&
      previousSalesPriceRegionRef.current === salesPriceRegion
    ) return;
    previousSalesPriceTableRef.current = salesPriceTable;
    previousSalesPriceRegionRef.current = salesPriceRegion;
    setPriceDrafts({});
    setLines((current) => current.map((line) => ({
      ...line,
      unitPrice: priceForClient(line.productId, clientId, lineUnits(line)),
    })));
  }, [priceForClient, clientId, lineUnits, salesPriceRegion, salesPriceTable]);

  const importedSalesPriceKey = importedSalesPriceTable
    ? `${importedSalesPriceTable.name || ""}|${importedSalesPriceTable.importedAt || ""}|${importedSalesPriceTable.period || ""}`
    : "";
  useEffect(() => {
    if (editId || !importedSalesPriceKey) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setPriceDrafts({});
      setLines((current) => current.map((line) => ({
        ...line,
        unitPrice: priceForClient(line.productId, clientId, lineUnits(line)),
      })));
    });
    return () => {
      cancelled = true;
    };
  }, [editId, importedSalesPriceKey, priceForClient, clientId, lineUnits]);

  useEffect(() => {
    if (
      editId ||
      initialAgreementAppliedRef.current ||
      agreements.length === 0 ||
      productById.size === 0
    ) return;
    initialAgreementAppliedRef.current = true;
    setPriceDrafts({});
    setLines((current) =>
      current.map((line) => {
        const product = productById.get(line.productId);
        return {
          ...line,
          unitPrice: priceForClient(line.productId, clientId, lineUnits(line)),
          brand: line.brand || product?.brand || "",
        };
      }),
    );
  }, [agreements, editId, productById, priceForClient, clientId, lineUnits]);

  const client = clientById.get(clientId) || clients[0];
  const salesPriceRegions = importedSalesPriceTable?.regions ?? SALES_PRICE_REGIONS;
  const salesPriceTables = importedSalesPriceTable?.categories ?? SALES_PRICE_TABLES;
  const salesPricePeriod = importedSalesPriceTable?.period ?? "não importada";
  const noPriceTable = !importedSalesPriceTable;
  const clientAgreement = agreements.find((group) =>
    group.clients.some((member) => member.id === clientId),
  );
  const filtered = useMemo(
    () =>
      products.filter((item) =>
        `${item.code} ${item.description}`
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
    [products, search],
  );
  // A line's billing brand comes from its product (Medicone products are
  // brand=Medicone); the stored line.brand is a fallback for legacy rows.
  const lineBrand = useCallback(
    (line: QuoteLine): BillingBrand =>
      normalizeBillingBrand(productById.get(line.productId)?.brand || line.brand),
    [productById],
  );
  // Brands present in the current quote, Halex Istar first, Medicone second.
  const brandsInQuote = useMemo<BillingBrand[]>(() => {
    const present = new Set(lines.map(lineBrand));
    return (["Halex Istar", "Medicone"] as BillingBrand[]).filter((brand) =>
      present.has(brand),
    );
  }, [lines, lineBrand]);
  // Lines shown/priced in the preview: all of them while editing, or just the
  // brand being rendered during the split PDF export.
  const visibleLines = useMemo(
    () => (printBrand ? lines.filter((line) => lineBrand(line) === printBrand) : lines),
    [lines, printBrand, lineBrand],
  );
  // The brand whose letterhead/identity the preview shows. During export it is
  // the brand being printed; while editing it is the sole brand present (or
  // Halex Istar when the quote mixes both).
  const activeBrand: BillingBrand =
    printBrand ?? (brandsInQuote.length === 1 ? brandsInQuote[0] : "Halex Istar");
  const activeLetterhead =
    activeBrand === "Medicone" ? mediconeLetterhead : letterhead;
  const brandIdentity = BRAND_IDENTITY[activeBrand];
  const totalForLine = (line: QuoteLine) => {
    const product = productById.get(line.productId);
    if (!product) return 0;
    return quotationLineDisplayTotal(
      line.quantityMode,
      line.quantity,
      line.unitQuantity,
      product.packSize || 1,
      line.unitPrice,
    );
  };
  const lineHasInvalidQuantity = (line: QuoteLine) => {
    if (line.quantityMode !== "units") return false;
    const product = productById.get(line.productId);
    if (!product) return false;
    const packSize = Math.max(1, product.packSize || 1);
    return !isFullBoxQuantity(line.unitQuantity || 0, packSize);
  };
  const hasInvalidQuantity = lines.some(lineHasInvalidQuantity);
  const subtotal = quotationCurrencyValue(
    visibleLines.reduce(
      (sum, line) => (lineHasInvalidQuantity(line) ? sum : sum + totalForLine(line)),
      0,
    ),
  );
  const valid = new Date(issued);
  valid.setDate(valid.getDate() + validDays);
  // Memoized so typing in the catalog search (or any other field) doesn't
  // re-run pagination over the quote lines on every keystroke.
  const quotationPages = useMemo(() => {
    const rows = visibleLines.flatMap((line) => {
      const product = productById.get(line.productId);
      if (!product) return [];
      return [{
        ...line,
        product,
        estimatedHeight: estimatedProductRowHeight(
          product.description,
          product.presentation,
        ),
      }];
    });
    return paginateQuotationRows(rows);
  }, [visibleLines, productById]);

  // True when a Medicone product has quantity-break faixas for the current
  // client tier — the only case where changing quantity should re-derive the
  // unit price (otherwise a manual price edit must be preserved).
  const isMediconeTiered = useCallback(
    (productId: string) => {
      const product = productById.get(productId);
      if (!product || normalizeBillingBrand(product.brand) !== "Medicone") return false;
      const isDistribuidor = clientById.get(clientId)?.clientType === "distribuidor";
      return Boolean(
        importedMediconeTable?.tiers?.[isDistribuidor ? "distribuidor" : "hospital"]?.[product.code]?.length,
      );
    },
    [productById, clientById, clientId, importedMediconeTable],
  );

  function add(productId: string) {
    setLines((current) => {
      const found = current.find((line) => line.productId === productId);
      const product = productById.get(productId);
      const brand = product?.brand || "";
      const packSize = Math.max(1, product?.packSize || 1);
      if (found) {
        const nextQuantity = found.quantity + 1;
        const nextUnits = nextQuantity * packSize;
        return current.map((line) =>
          line.productId === productId
            ? {
                ...line,
                quantity: nextQuantity,
                // Keep the unit count in sync when the line is expressed in units.
                unitQuantity: line.quantityMode === "units" ? nextUnits : line.unitQuantity,
                // Re-derive the faixa price only for tiered Medicone products.
                unitPrice: isMediconeTiered(productId)
                  ? priceForClient(productId, clientId, nextUnits)
                  : line.unitPrice,
                brand: line.brand || brand,
              }
            : line,
        );
      }
      return [
        ...current,
        {
          productId,
          quantity: 1,
          unitPrice: priceForClient(productId, clientId, packSize),
          brand,
          quantityMode: "units",
          unitQuantity: packSize,
        },
      ];
    });
  }
  function update(index: number, patch: Partial<QuoteLine>) {
    setLines((current) =>
      current.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    );
  }

  function clearPriceDraft(productId: string) {
    setPriceDrafts((current) => {
      const next = { ...current };
      delete next[quotationPriceDraftKey(productId, "units")];
      delete next[quotationPriceDraftKey(productId, "boxes")];
      return next;
    });
  }

  // Wait for React to commit and the browser to paint the brand-filtered pages
  // before printToPDF snapshots the DOM.
  const nextPaint = () =>
    new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );

  async function saveQuotation(generatePdf = false) {
    if (!client || lines.length === 0) return;
    const invalidLine = lines.find((line) => {
      return lineHasInvalidQuantity(line);
    });
    if (invalidLine) {
      setNotice("A quantidade em unidades deve completar caixas inteiras.");
      return;
    }
    const hasUnavailable = lines.some(
      (line) => !products.find((item) => item.id === line.productId),
    );
    if (hasUnavailable) {
      setNotice("Remova os itens indisponíveis antes de salvar.");
      return;
    }

    // Each invoicing brand becomes its own cotação (separate quote_number, items
    // and total) because Halex Istar and Medicone are faturados separately.
    const brands = brandsInQuote;
    const multiBrand = brands.length > 1;
    const base = savedId || `manual-${Date.now()}`;
    const baseSuffix = quoteNumber.replace(/^(HI|MC)-/, "");
    // When splitting an existing quote into two brands, the brand matching the
    // original quote_number keeps the original row (id + number) so we update it
    // in place; the added brand gets a fresh id and number. Otherwise the reused
    // number would collide with the still-existing original row (quote_number is
    // UNIQUE) and the save would fail.
    const originalPrefix = editId ? (quoteNumber.match(/^(HI|MC)-/)?.[1] ?? "HI") : null;
    const buildQuote = (brand: BillingBrand) => {
      const identity = BRAND_IDENTITY[brand];
      const recordId = multiBrand
        ? (originalPrefix && identity.prefix === originalPrefix
            ? base
            : `${base}-${identity.prefix.toLowerCase()}`)
        : base;
      const brandLines = lines.filter((line) => lineBrand(line) === brand);
      const items = brandLines.map((line) => {
        const product = products.find((item) => item.id === line.productId)!;
        return {
          product_id: product.id,
          code: product.code,
          description: product.description,
          presentation: product.presentation,
          brand,
          unit: product.unit,
          quantity: line.quantity,
          unit_price: line.unitPrice,
          total_value: totalForLine(line),
          quantity_mode: line.quantityMode || "boxes",
          unit_quantity: line.quantityMode === "units" ? line.unitQuantity : null,
        };
      });
      const brandTotal = quotationCurrencyValue(
        brandLines.reduce((sum, line) => sum + totalForLine(line), 0),
      );
      return {
        number: `${identity.prefix}-${baseSuffix}`,
        record: {
          id: recordId,
          client_name: client.name,
          quote_number: `${identity.prefix}-${baseSuffix}`,
          client_id: client.id,
          issued_at: toDateInput(issued),
          valid_until: toDateInput(valid),
          status: "draft",
          seller,
          representative_role: representative.role,
          representative_phone: representative.phone,
          representative_email: representative.email,
          sales_price_table: salesPriceTable,
          sales_price_region: salesPriceRegion,
          payment_terms: payment,
          delivery_terms: delivery,
          freight_terms: freight,
          notes,
          total_value: brandTotal,
          items,
        },
      };
    };
    const quotes = brands.map(buildQuote);

    setSaving(true);
    try {
      if (window.halexDesktop) {
        for (const quote of quotes) {
          await window.halexDesktop.quotations.save(quote.record);
        }
        setSavedId(base);
        setNotice(
          multiBrand
            ? "Cotações salvas no computador (uma por marca)."
            : "Cotação salva no computador.",
        );
        if (generatePdf) {
          // Render and export one brand at a time so each PDF gets only that
          // brand's items and letterhead.
          for (const brand of brands) {
            setPrintBrand(brand);
            await nextPaint();
            // Deterministically wait for the rendered letterhead image(s) to
            // finish decoding before the snapshot — otherwise a large letterhead
            // (e.g. the high-res Medicone PNG) is captured blank.
            const letterheadImgs = Array.from(
              document.querySelectorAll<HTMLImageElement>(".print-document .quotation-letterhead-bg"),
            );
            await Promise.all(
              letterheadImgs.map((img) =>
                img.complete && img.naturalWidth > 0
                  ? img.decode().catch(() => {})
                  : new Promise<void>((resolve) => {
                      img.onload = () => resolve();
                      img.onerror = () => resolve();
                    }),
              ),
            );
            await nextPaint();
            await window.halexDesktop.quotations.pdf(
              `${BRAND_IDENTITY[brand].prefix}-${baseSuffix}`,
              client.name,
            );
          }
          setPrintBrand(null);
          setNotice(
            multiBrand
              ? "Cotações salvas e 2 PDFs gerados na pasta Cotações (Halex Istar e Medicone)."
              : "Cotação salva e PDF gerado na pasta Cotações.",
          );
        }
      } else {
        let manualQuotations: Array<StoredQuote | typeof quotes[number]["record"]> = [];
        try {
          const parsed = JSON.parse(localStorage.getItem("manualQuotations") || "[]");
          if (Array.isArray(parsed)) manualQuotations = parsed;
        } catch {}
        for (const quote of quotes) {
          const index = manualQuotations.findIndex(
            (item) => String(item.id) === quote.record.id,
          );
          if (index > -1) manualQuotations[index] = quote.record;
          else manualQuotations.push(quote.record);
        }
        localStorage.setItem("manualQuotations", JSON.stringify(manualQuotations));
        setSavedId(base);
        setNotice(
          multiBrand
            ? "Cotações salvas localmente (uma por marca)."
            : "Cotação salva localmente com sucesso.",
        );
        if (generatePdf) window.print();
      }
      localStorage.removeItem("quotationWorkingDraft");
      toast(generatePdf ? "Cotação salva e PDF preparado." : "Cotação salva com segurança.");
    } catch {
      setPrintBrand(null);
      setNotice("Não foi possível salvar a cotação. Tente novamente.");
      toast("Não foi possível salvar a cotação.", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 pb-16">
      <header className="print-hidden page-hero flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="lumina-kicker">Gerador comercial</p>
          <h1 className="mt-2">Nova cotação</h1>
          <p className="mt-2 text-sm text-stone-500">
            Escolha o cliente e os produtos. O documento é calculado e montado
            automaticamente.
          </p>
          <p className="mt-2 text-xs font-semibold text-stone-400" aria-live="polite">{saving ? "Salvando…" : savedId ? "Salva neste computador" : lastDraftAt ? `Rascunho automático · ${lastDraftAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : "Rascunho será salvo automaticamente"}</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void saveQuotation(false)}
            disabled={saving || lines.length === 0}
            className="brand-secondary inline-flex items-center gap-2 px-3 py-2 text-xs font-bold"
          >
            <Printer size={15} />
            {saving ? "Salvando…" : "Salvar"}
          </button>
          <button
            type="button"
            onClick={() => void saveQuotation(true)}
            disabled={saving || lines.length === 0}
            className="brand-button inline-flex items-center gap-2 px-3 py-2 text-xs font-bold"
          >
            <FileDown size={15} />
            Gerar PDF
          </button>
        </div>
      </header>
      {pendingDraft && lines.length === 0 && (
        <div className="print-hidden flex flex-wrap items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-900">
          <span className="flex-1">
            Há uma cotação não finalizada
            {pendingDraft.savedAt
              ? ` de ${new Date(pendingDraft.savedAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`
              : ""}
            . Deseja retomar?
          </span>
          <button
            type="button"
            onClick={resumeDraft}
            className="brand-button inline-flex items-center gap-2 px-3 py-1.5 text-xs font-bold"
          >
            Retomar cotação
          </button>
          <button
            type="button"
            onClick={discardDraft}
            className="brand-secondary inline-flex items-center gap-2 px-3 py-1.5 text-xs font-bold"
          >
            Descartar
          </button>
        </div>
      )}
      {notice && (
        <div className="print-hidden rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">
          {notice}
        </div>
      )}
      {noPriceTable && (
        <div className="print-hidden rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-800">
          Nenhuma tabela de preços foi importada. Os valores usam o preço de catálogo de cada produto — importe a tabela atual em Importar antes de gerar cotações para garantir os preços vigentes.
        </div>
      )}
      {brandsInQuote.length > 1 && (
        <div className="print-hidden rounded-lg border border-sky-300 bg-sky-50 p-3 text-sm font-semibold text-sky-900">
          Esta cotação será dividida em 2 documentos — um para Halex Istar e outro
          para Medicone — porque as marcas são faturadas separadamente. Ao gerar o
          PDF, os dois arquivos são salvos na pasta Cotações.
        </div>
      )}

      <div className="grid min-w-0 gap-6 2xl:grid-cols-[minmax(0,1fr)_480px]">
        <div className="print-hidden min-w-0 space-y-5">
          <section className="glass-card p-5">
            <h2 className="font-semibold">Cliente e condições</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <label className="text-xs font-bold md:col-span-3">
                Cliente
                <select
                  className="form-input mt-2 w-full"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                >
                  {clients.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.code} · {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-bold md:col-span-3">
                Região da tabela · {salesPricePeriod}
                <select
                  className="form-input mt-2 w-full"
                  value={salesPriceRegion}
                  onChange={(event) => setSalesPriceRegion(event.target.value as SalesPriceRegion)}
                >
                  {salesPriceRegions.map((region) => (
                    <option key={region.value} value={region.value}>{region.label}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-bold md:col-span-3">
                Categoria de preço · {salesPricePeriod}
                <select
                  className="form-input mt-2 w-full"
                  value={salesPriceTable}
                  onChange={(event) => setSalesPriceTable(event.target.value as SalesPriceTable)}
                >
                  {salesPriceTables.map((table) => (
                    <option key={table.value} value={table.value}>{table.label}</option>
                  ))}
                </select>
                <span className="mt-1 block font-normal text-stone-500">
                  Ao trocar a tabela, os preços dos itens já adicionados são recalculados.
                </span>
              </label>
              {clientAgreement && (
                <div className="md:col-span-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-800">
                  <strong>Acordo aplicado: {clientAgreement.name}</strong>
                  <span className="ml-1">
                    · {clientAgreement.prices.length} preço(s) especial(is). Os valores continuam editáveis.
                  </span>
                </div>
              )}
              <label className="text-xs font-bold">
                Validade
                <input
                  type="number"
                  min="1"
                  className="form-input mt-2 w-full"
                  value={validDays}
                  onChange={(e) => setValidDays(Number(e.target.value) || 1)}
                />
              </label>
              <label className="text-xs font-bold">
                Pagamento
                <select
                  className="form-input mt-2 w-full"
                  value={paymentIsCustom ? "__custom__" : payment}
                  onChange={(e) => {
                    if (e.target.value === "__custom__") {
                      setPaymentIsCustom(true);
                      setPayment("");
                    } else {
                      setPaymentIsCustom(false);
                      setPayment(e.target.value);
                    }
                  }}
                >
                  {PAYMENT_PRESETS.map((preset) => (
                    <option key={preset} value={preset}>{preset}</option>
                  ))}
                  <option value="__custom__">Personalizado…</option>
                </select>
                {paymentIsCustom && (
                  <input
                    className="form-input mt-2 w-full"
                    value={payment}
                    onChange={(e) => setPayment(e.target.value)}
                    placeholder="Digite a condição de pagamento"
                  />
                )}
              </label>
              <label className="text-xs font-bold">
                Frete
                <input
                  className="form-input mt-2 w-full"
                  value={freight}
                  onChange={(e) => setFreight(e.target.value)}
                />
              </label>
              <label className="text-xs font-bold md:col-span-3">
                Entrega
                <input
                  className="form-input mt-2 w-full"
                  value={delivery}
                  onChange={(e) => setDelivery(e.target.value)}
                />
              </label>
              <label className="text-xs font-bold md:col-span-3">
                Observações
                <textarea
                  rows={2}
                  className="form-input mt-2 w-full"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </label>
              <label className="md:col-span-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs font-bold text-amber-900">
                <input
                  type="checkbox"
                  checked={hidePrices}
                  onChange={(e) => setHidePrices(e.target.checked)}
                  className="h-4 w-4 accent-amber-600"
                />
                Enviar sem preços — apenas a lista de produtos e unidades por caixa
              </label>
              <fieldset className="md:col-span-3 rounded-lg border border-stone-200 bg-stone-50 p-3">
                <legend className="px-1 text-[10px] font-bold uppercase tracking-wider text-stone-500">
                  Representante
                </legend>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  <label className="text-[10px] font-bold text-stone-600">
                    Nome
                    <input className="form-input mt-1 w-full" value={seller} onChange={(e) => setSeller(e.target.value)} />
                  </label>
                  <label className="text-[10px] font-bold text-stone-600">
                    Função
                    <input className="form-input mt-1 w-full" value={representative.role} onChange={(e) => setRepresentative((current) => ({ ...current, role: e.target.value }))} />
                  </label>
                  <label className="text-[10px] font-bold text-stone-600">
                    Telefone
                    <input type="tel" className="form-input mt-1 w-full" value={representative.phone} onChange={(e) => setRepresentative((current) => ({ ...current, phone: e.target.value }))} />
                  </label>
                  <label className="text-[10px] font-bold text-stone-600">
                    E-mail
                    <input type="email" className="form-input mt-1 w-full" value={representative.email} onChange={(e) => setRepresentative((current) => ({ ...current, email: e.target.value }))} />
                  </label>
                </div>
                <p className="mt-2 text-[10px] text-stone-500">Salvo automaticamente para as próximas cotações.</p>
              </fieldset>
            </div>
          </section>

          <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(430px,1.1fr)]">
          <section className="glass-card order-2 p-5 xl:order-1">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold">Adicionar produtos</h2>
                <p className="mt-1 text-xs text-stone-500">
                  {clientAgreement
                    ? `Preços do acordo ${clientAgreement.name}.`
                    : "Tabela comercial Halex Istar. Produtos sem preço podem ser preenchidos manualmente."}
                </p>
              </div>
            </div>
            <div className="relative mt-4">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
                size={15}
              />
              <input
                className="form-input input-with-icon w-full"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar código ou produto"
                onKeyDown={(event) => { if (event.key === "Enter" && filtered[0]) { event.preventDefault(); add(filtered[0].id); } }}
              />
            </div>
            <div className="mt-3 divide-y divide-stone-100">
              {filtered.map((product) => (
                <div key={product.id} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">
                      {product.description}
                    </p>
                    <p className="mt-1 text-xs text-stone-500">
                      {product.code} · {product.presentation}
                    </p>
                    <p className="mt-1 text-[11px] font-semibold text-amber-800">Caixa com {Math.max(1, product.packSize || 1)} unidade(s)</p>
                    {product.brand && (
                      <p className="mt-0.5 text-[11px] font-semibold text-stone-600">
                        Marca: {product.brand}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => add(product.id)}
                    className="brand-secondary inline-flex h-9 w-9 items-center justify-center"
                    title="Adicionar produto"
                  >
                    <Plus size={15} />
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className="glass-card order-1 flex flex-col overflow-hidden xl:sticky xl:top-6 xl:max-h-[calc(100vh-3rem)] xl:order-2">
            <div className="flex items-center justify-between border-b border-stone-100 p-5">
              <h2 className="font-semibold">Itens da cotação</h2>
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-800">
                {lines.length} {lines.length === 1 ? "item" : "itens"}
              </span>
            </div>
            <div className="min-h-0 flex-1 divide-y divide-stone-100 xl:overflow-y-auto">
              {lines.length === 0 && (
                <p className="p-6 text-center text-sm text-stone-500">
                  Adicione um produto para começar a cotação. O preço poderá ser preenchido manualmente.
                </p>
              )}
              {lines.map((line, index) => {
                const product = products.find(
                  (item) => item.id === line.productId,
                );
                if (!product) {
                  return (
                    <div
                      key={line.productId}
                      className="flex items-center justify-between gap-3 p-4"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-red-600">
                          Produto indisponível
                        </p>
                        <p className="mt-1 text-xs text-stone-500">
                          {line.productId} · não está na tabela de preços ativa. Remova o item para continuar.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setLines((current) => current.filter((_, i) => i !== index))
                        }
                        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-red-200 text-red-600"
                        title="Remover item"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  );
                }
                const packSize = Math.max(1, product.packSize || 1);
                const unitMode = line.quantityMode === "units";
                const enteredQuantity = unitMode ? (line.unitQuantity ?? line.quantity * packSize) : line.quantity;
                const invalidUnits = unitMode && !isFullBoxQuantity(enteredQuantity, packSize);
                const priceDraftKey = quotationPriceDraftKey(line.productId, line.quantityMode);
                const displayUnitPrice = quotationDisplayUnitPrice(
                  line.quantityMode,
                  line.unitPrice,
                  packSize,
                );
                const switchQuantityMode = (nextMode: "boxes" | "units") => {
                  const units = quotationLineUnits(
                    line.quantityMode,
                    line.quantity,
                    line.unitQuantity,
                    packSize,
                  );
                  clearPriceDraft(line.productId);
                  update(
                    index,
                    nextMode === "units"
                      ? { quantityMode: "units", unitQuantity: units }
                      : {
                          quantityMode: "boxes",
                          quantity: Math.max(1, Math.ceil(units / packSize)),
                          unitQuantity: undefined,
                        },
                  );
                };
                const tiered = isMediconeTiered(line.productId);
                const updateQuantity = (amount: number) => {
                  if (unitMode) {
                    const patch: Partial<QuoteLine> = {
                      unitQuantity: amount,
                      ...(amount > 0 && amount % packSize === 0
                        ? { quantity: amount / packSize }
                        : {}),
                    };
                    if (tiered) {
                      patch.unitPrice = priceForClient(line.productId, clientId, amount);
                      clearPriceDraft(line.productId);
                    }
                    update(index, patch);
                  } else {
                    const nextQuantity = Math.max(1, amount);
                    const patch: Partial<QuoteLine> = { quantity: nextQuantity };
                    if (tiered) {
                      patch.unitPrice = priceForClient(line.productId, clientId, nextQuantity * packSize);
                      clearPriceDraft(line.productId);
                    }
                    update(index, patch);
                  }
                };
                const appliedFaixa = tiered
                  ? mediconeTier(
                      product.code,
                      clientById.get(clientId)?.clientType === "distribuidor",
                      quotationLineUnits(line.quantityMode, line.quantity, line.unitQuantity, packSize),
                    )
                  : null;
                const faixaLabel = appliedFaixa
                  ? appliedFaixa.max == null
                    ? `acima de ${appliedFaixa.min} un`
                    : appliedFaixa.min === 1
                      ? `até ${appliedFaixa.max} un`
                      : `${appliedFaixa.min} a ${appliedFaixa.max} un`
                  : "";
                return (
                  <div
                    key={product.id}
                    className="grid gap-3 p-4 sm:grid-cols-[170px_minmax(120px,1fr)_auto_40px] sm:items-end"
                  >
                    <div className="sm:col-span-4">
                      <p className="text-sm font-semibold">
                        {product.description}
                      </p>
                      <p className="mt-1 text-xs text-stone-500">
                        {product.code} · {product.presentation}
                      </p>
                      {appliedFaixa && (
                        <p className="mt-1 text-[11px] font-semibold text-sky-700">
                          Condição Medicone aplicada: {faixaLabel} → {money(appliedFaixa.price)}/un
                        </p>
                      )}
                    </div>
                    <label className="text-[10px] font-bold uppercase text-stone-500">
                      Quantidade · caixa com {packSize}
                      <div className="mt-1 grid grid-cols-[82px_1fr] gap-1">
                        <select
                          className="form-input px-2"
                          value={unitMode ? "units" : "boxes"}
                          onChange={(e) =>
                            switchQuantityMode(e.target.value === "units" ? "units" : "boxes")
                          }
                        >
                          <option value="boxes">Caixas</option>
                          <option value="units">Unidades</option>
                        </select>
                        <input
                          type="number"
                          min={unitMode ? packSize : 1}
                          step={unitMode ? packSize : 1}
                          className={`form-input w-full ${invalidUnits ? "border-red-400" : ""}`}
                          value={enteredQuantity}
                          onChange={(e) =>
                            updateQuantity(Math.max(0, Math.trunc(Number(e.target.value) || 0)))
                          }
                        />
                      </div>
                      {invalidUnits && <span className="mt-1 block normal-case text-red-600">Use múltiplos de {packSize} unidades.</span>}
                    </label>
                    <label className="text-[10px] font-bold uppercase text-stone-500">
                      {unitMode ? "Preço por unidade" : "Preço por caixa"}
                      <input
                        key={priceDraftKey}
                        type="text"
                        inputMode="decimal"
                        className="form-input mt-1 w-full"
                        value={priceDrafts[priceDraftKey] ?? formatQuotationPriceInput(displayUnitPrice)}
                        onFocus={(e) => {
                          setPriceDrafts((current) => ({
                            ...current,
                            [priceDraftKey]: formatQuotationPriceInput(displayUnitPrice),
                          }));
                          e.currentTarget.select();
                        }}
                        onChange={(e) => {
                          const value = e.target.value;
                          setPriceDrafts((current) => ({
                            ...current,
                            [priceDraftKey]: value,
                          }));
                          const entered = parseQuotationPriceInput(value);
                          update(index, {
                            unitPrice: quotationUnitPriceFromDisplay(
                              line.quantityMode,
                              entered,
                              packSize,
                            ),
                          });
                        }}
                        onBlur={() =>
                          setPriceDrafts((current) => {
                            const next = { ...current };
                            delete next[priceDraftKey];
                            return next;
                          })
                        }
                      />
                    </label>
                    <div>
                      <p className="text-[10px] font-bold uppercase text-stone-500">
                        Total
                      </p>
                      <p className="money-value mt-3 text-sm font-bold">
                        {invalidUnits ? "Quantidade inválida" : money(totalForLine(line))}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setLines((current) =>
                          current.filter((_, i) => i !== index),
                        )
                      }
                      className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-red-200 text-red-600"
                      title="Remover item"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-end border-t border-stone-200 bg-stone-50 p-5">
              <div className="text-right">
                <p className="text-xs text-stone-500">Total da cotação</p>
                <p className="money-value mt-1 text-2xl font-bold">
                  {hasInvalidQuantity ? "Corrija a quantidade" : money(subtotal)}
                </p>
              </div>
            </div>
          </section>
          </div>
        </div>

        <aside className="print-document mx-auto min-w-0 w-full max-w-[820px] self-start space-y-5 bg-stone-100 p-5 shadow-sm 2xl:sticky 2xl:top-6">
          {quotationPages.map((pageRows, pageIndex) => {
            const firstPage = pageIndex === 0;
            const lastPage = pageIndex === quotationPages.length - 1;
            const previousRows = quotationPages
              .slice(0, pageIndex)
              .reduce((total, page) => total + page.length, 0);

            return (
              <article
                key={pageIndex}
                className={`quotation-page ${activeLetterhead?.dataUrl ? "quotation-page-letterhead" : "quotation-page-standard"}`}
              >
                {activeLetterhead?.dataUrl && (
                  // A real <img> (not a CSS background) so its decode can be
                  // awaited before printToPDF and it reliably prints — large
                  // background images were being captured before they painted.
                  // next/image is unsuitable here (local data-URL, print output).
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={activeLetterhead.dataUrl}
                    alt=""
                    aria-hidden
                    className="quotation-letterhead-bg"
                  />
                )}
                {!activeLetterhead?.dataUrl && (
                  <header className="quotation-brand-header">
                    <div>
                      <p className="quotation-brand-name">{brandIdentity.name}</p>
                      <p className="quotation-brand-subtitle">{brandIdentity.subtitle}</p>
                    </div>
                    <div className="quotation-brand-mark">{brandIdentity.mark}</div>
                  </header>
                )}

                <div className="quotation-page-heading">
                  <div>
                    <p className="quotation-eyebrow">Proposta comercial</p>
                    {!firstPage && (
                      <p className="quotation-page-context">Continuação · {client.name}</p>
                    )}
                  </div>
                  <div className="quotation-page-meta">
                    <span>Página {pageIndex + 1} de {quotationPages.length}</span>
                  </div>
                </div>

                {firstPage ? (
                  <section className="quotation-client quotation-keep">
                    <div className="quotation-client-name">
                      <span>Cliente</span>
                      <strong>{client.name}</strong>
                    </div>
                    <dl>
                      <div><dt>CNPJ</dt><dd>{client.cnpj ?? "Não informado"}</dd></div>
                      <div><dt>Cidade</dt><dd>{client.city}/{client.state}</dd></div>
                    </dl>
                  </section>
                ) : (
                  <div className="quotation-continuation-client">
                    <strong>{client.name}</strong>
                    <span>{client.city}/{client.state}</span>
                  </div>
                )}

                <table className="quotation-table">
                  <colgroup>
                    <col className="w-[6%]" />
                    <col className={hidePrices ? "w-[62%]" : "w-[36%]"} />
                    <col className={hidePrices ? "w-[20%]" : "w-[12%]"} />
                    <col className={hidePrices ? "w-[12%]" : "w-[10%]"} />
                    {!hidePrices && (
                      <>
                        <col className="w-[10%]" />
                        <col className="w-[13%]" />
                        <col className="w-[13%]" />
                      </>
                    )}
                  </colgroup>
                  <thead>
                    <tr>
                      <th className="text-center">Item</th>
                      <th className="text-left">Produto / apresentação</th>
                      <th className="text-center">Marca</th>
                      <th className="text-center">Un./cx</th>
                      {!hidePrices && (
                        <>
                          <th className="text-center">Qtd.</th>
                          <th className="text-center">Unitário</th>
                          <th className="text-center">Total</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((row, rowIndex) => (
                      <tr key={row.product.id}>
                        <td className="quotation-item-number text-center">{previousRows + rowIndex + 1}</td>
                        <td className="quotation-product-cell">
                          <span>{row.product.code}</span>
                          <strong>{row.product.description}</strong>
                          {row.product.presentation && <small>{row.product.presentation}</small>}
                        </td>
                        <td className="quotation-brand-cell text-center">{row.brand || row.product.brand || "—"}</td>
                        <td className="text-center font-semibold">{Math.max(1, row.product.packSize || 1)}</td>
                        {!hidePrices && (
                          <>
                            <td className="text-center font-semibold">
                              {row.quantityMode === "units" ? (
                                <>
                                  {row.unitQuantity} un
                                  <span className="block font-normal" style={{ color: "#64748b" }}>{row.quantity} cx</span>
                                </>
                              ) : (
                                <>{row.quantity} cx</>
                              )}
                            </td>
                            <td className="text-center">{money(row.quantityMode === "units" ? row.unitPrice : row.unitPrice * (row.product.packSize || 1))}</td>
                            <td className="text-center font-bold">{money(quotationLineDisplayTotal(row.quantityMode, row.quantity, row.unitQuantity, row.product.packSize || 1, row.unitPrice))}</td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>

                {lastPage && (
                  <div className="quotation-final-block quotation-keep">
                    <section className="quotation-summary">
                      {!hidePrices && (
                        <div className="quotation-grand-total">
                          <span>Valor total da proposta</span>
                          <strong>{hasInvalidQuantity ? "Corrija a quantidade" : money(subtotal)}</strong>
                        </div>
                      )}
                      <dl className="quotation-conditions">
                        <div><dt>Pagamento</dt><dd>{payment}</dd></div>
                        <div><dt>Entrega</dt><dd>{delivery}</dd></div>
                        <div><dt>Frete</dt><dd>{freight}</dd></div>
                        <div><dt>Validade</dt><dd>Até {appDate(toDateInput(valid))} · {validDays} dias</dd></div>
                      </dl>
                    </section>
                    <section className="quotation-representative">
                      <div className="quotation-representative-heading">
                        <span>Representante comercial</span>
                      </div>
                      <dl>
                        <div><dt>Nome</dt><dd>{seller}</dd></div>
                        <div className="quotation-representative-contact">
                          <dt>Contato</dt>
                          <dd>{representative.phone || "Telefone não informado"}</dd>
                          <dd>{representative.email || "E-mail não informado"}</dd>
                        </div>
                        <div><dt>Data da proposta</dt><dd>{appDate(toDateInput(issued))}</dd></div>
                      </dl>
                    </section>
                  </div>
                )}

                {!activeLetterhead?.dataUrl && (
                  <footer className="quotation-footer">
                    <span>{brandIdentity.footer}</span>
                    <span>Documento comercial · Página {pageIndex + 1}/{quotationPages.length}</span>
                  </footer>
                )}
              </article>
            );
          })}
        </aside>
      </div>
    </div>
  );
}

export default function NewQuotationPage() {
  return (
    <Suspense
      fallback={
        <div className="p-10 text-center text-sm text-stone-500">
          Preparando cotação...
        </div>
      }
    >
      <Builder />
    </Suspense>
  );
}
