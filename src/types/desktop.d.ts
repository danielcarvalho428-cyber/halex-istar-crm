type ClientType = 'hospital' | 'particular' | 'distribuidor';

/** Extended desktop client shape */
interface DesktopClient {
  id: string;
  code: string;
  name: string;
  city: string;
  state: string;
  contact: string;
  phone: string;
  email: string;
  last_purchase: string;
  average_cycle_days: number;
  next_purchase: string;
  total_12m: number;
  status: string;
  /** New fields */
  client_type?: ClientType;
  cnpj?: string;
  document?: string;
  carteira?: string;
  notes?: string;
  address?: string;
}

type DesktopProduct = Record<string, string | number | boolean | null>;

type DesktopQuotation = Record<string, unknown>;

type DesktopSalesPriceTable = {
  name: string;
  period: string;
  importedAt: string;
  regions: Array<{ value: string; label: string }>;
  categories: Array<{ value: string; label: string }>;
  products: Array<{ code: string; description: string }>;
  prices: Record<string, Record<string, Record<string, number>>>;
  invalidPrices: number;
  fallbackPrices: number;
};

type DesktopAgreementGroup = {
  id: string;
  name: string;
  description: string | null;
  active: number;
  price_table_name?: string | null;
  price_table_imported_at?: string | null;
  clients: Array<{
    id: string;
    code: string;
    name: string;
    city: string;
    state: string;
  }>;
  prices: Array<{
    product_code: string;
    price: number;
    description: string | null;
  }>;
};

interface HalexDesktopApi {
  isDesktop: true;
  clients: {
    list(): Promise<DesktopClient[]>;
    get(id: string): Promise<DesktopClient | null>;
    delete(id: string): Promise<boolean>;
    save(value: Partial<DesktopClient> & { name: string }): Promise<string>;
  };
  products: {
    list(): Promise<DesktopProduct[]>;
    save(value: DesktopProduct): Promise<string>;
  };
  quotations: {
    list(): Promise<DesktopQuotation[]>;
    get(id: string): Promise<DesktopQuotation | null>;
    delete(id: string): Promise<boolean>;
    save(value: DesktopQuotation): Promise<string>;
    pdf(quoteNumber: string, clientName?: string): Promise<string | null>;
  };
  agreements: {
    list(): Promise<DesktopAgreementGroup[]>;
    save(value: {
      id?: string;
      name: string;
      description?: string;
      active?: boolean;
    }): Promise<string>;
    delete(groupId: string): Promise<boolean>;
    addClient(groupId: string, clientId: string): Promise<boolean>;
    removeClient(groupId: string, clientId: string): Promise<boolean>;
    savePrice(
      groupId: string,
      productCode: string,
      price: number,
    ): Promise<boolean>;
    deletePrice(groupId: string, productCode: string): Promise<boolean>;
    importPrices(groupId: string): Promise<{
      fileName: string;
      imported: number;
      ignored: number;
      matchedProducts: number;
    } | null>;
  };
  settings: {
    chooseLetterhead(): Promise<string | null>;
    getLetterhead(): Promise<{
      fileName: string;
      mime: string;
      dataUrl: string | null;
    } | null>;
    getEmail(): Promise<{
      email: string;
      senderName: string;
      signatureName: string;
      signatureRole: string;
      phone: string;
      logoFiles: Array<{ fileName: string; path: string }>;
      hasAppPassword: boolean;
    } | null>;
    saveEmail(value: {
      email: string;
      appPassword?: string;
      senderName: string;
      signatureName: string;
      signatureRole: string;
      phone: string;
    }): Promise<boolean>;
    chooseEmailLogos(): Promise<string[] | null>;
    testEmail(): Promise<boolean>;
    getDataFolder(): Promise<string>;
    openDataFolder(): Promise<string>;
    chooseDataFolder(): Promise<string>;
  };
  billing: {
    parseReportPdf(data: ArrayBuffer): Promise<string>;
    chooseDanfes(): Promise<Array<{
      token: string;
      fileName: string;
      size: number;
      invoiceNumber: string;
      customerOrderNumber: string;
      accessKey: string;
      issues: string[];
    }>>;
    sendEmail(value: {
      to: string;
      subject: string;
      body: string;
      attachmentTokens: string[];
      invoiceNumbers: string[];
    }): Promise<{
      id: string;
      sentAt: string;
      to: string;
      subject: string;
      invoiceNumbers: string[];
      attachments: string[];
      messageId: string;
      status: string;
    }>;
    emailHistory(): Promise<Array<{
      id: string;
      sentAt: string;
      to: string;
      subject: string;
      invoiceNumbers: string[];
      attachments: string[];
      status: string;
    }>>;
  };
  imports: {
    products(): Promise<{
      fileName: string;
      kind: "catalog" | "sales-price-table";
      total: number;
      imported: number;
      ignored: number;
      regions?: number;
      categories?: number;
      fallbackPrices?: number;
      period?: string;
    } | null>;
    clients(): Promise<{
      fileName: string;
      total: number;
      added: number;
      updated: number;
      ignored: number;
    } | null>;
    priceVersions(): Promise<Array<{
      id: string;
      name: string;
      imported_at: string;
      row_count: number;
      active: number;
    }>>;
    activatePriceVersion(versionId: string): Promise<number>;
    deletePriceVersion(versionId: string): Promise<{
      deleted: boolean;
      activatedVersionId: string | null;
    }>;
    activeSalesPriceTable(): Promise<DesktopSalesPriceTable | null>;
  };
  updates: {
    check(): Promise<{
      currentVersion: string;
      latestVersion: string;
      available: boolean;
    }>;
  };
  backup: { create(): Promise<string | null>; restore(): Promise<boolean> };
}

interface Window {
  halexDesktop?: HalexDesktopApi;
}
