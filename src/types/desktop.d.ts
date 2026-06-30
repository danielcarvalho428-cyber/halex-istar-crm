type DesktopClient = Record<string, string | number | null>;
type DesktopProduct = Record<string, string | number | boolean | null>;
type DesktopQuotation = Record<string, unknown>;

interface HalexDesktopApi {
  isDesktop: true;
  clients: { list(): Promise<DesktopClient[]>; save(value: DesktopClient): Promise<string> };
  products: { list(): Promise<DesktopProduct[]>; save(value: DesktopProduct): Promise<string> };
  quotations: {
    list(): Promise<DesktopQuotation[]>;
    save(value: DesktopQuotation): Promise<string>;
    pdf(quoteNumber: string): Promise<string | null>;
  };
  settings: { chooseLetterhead(): Promise<string | null> };
  backup: { create(): Promise<string | null>; restore(): Promise<boolean> };
}

interface Window { halexDesktop?: HalexDesktopApi }
