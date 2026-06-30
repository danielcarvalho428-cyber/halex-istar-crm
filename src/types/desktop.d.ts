type DesktopClient = Record<string, string | number | null>;
type DesktopProduct = Record<string, string | number | boolean | null>;
type DesktopQuotation = Record<string, unknown>;

interface HalexDesktopApi {
  isDesktop: true;
  clients: {
    list(): Promise<DesktopClient[]>;
    save(value: DesktopClient): Promise<string>;
  };
  products: {
    list(): Promise<DesktopProduct[]>;
    save(value: DesktopProduct): Promise<string>;
  };
  quotations: {
    list(): Promise<DesktopQuotation[]>;
    save(value: DesktopQuotation): Promise<string>;
    pdf(quoteNumber: string): Promise<string | null>;
  };
  settings: {
    chooseLetterhead(): Promise<string | null>;
    getLetterhead(): Promise<{
      fileName: string;
      mime: string;
      dataUrl: string | null;
    } | null>;
  };
  imports: {
    products(): Promise<{
      fileName: string;
      total: number;
      imported: number;
      ignored: number;
    } | null>;
    clients(): Promise<{
      fileName: string;
      total: number;
      added: number;
      updated: number;
      ignored: number;
    } | null>;
    priceVersions(): Promise<
      Array<{
        id: string;
        name: string;
        imported_at: string;
        row_count: number;
        active: number;
      }>
    >;
    activatePriceVersion(versionId: string): Promise<number>;
  };
  backup: { create(): Promise<string | null>; restore(): Promise<boolean> };
}

interface Window {
  halexDesktop?: HalexDesktopApi;
}
