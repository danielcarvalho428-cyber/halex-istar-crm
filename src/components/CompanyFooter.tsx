import type { ReactNode } from 'react';

type CompanyFooterProps = {
  dark?: boolean;
  className?: string;
  endContent?: ReactNode;
};

export default function CompanyFooter({
  dark = false,
  className = '',
  endContent,
}: CompanyFooterProps) {
  return (
    <footer className={`company-footer ${dark ? 'company-footer-dark' : ''} ${className}`}>
      <div className="company-footer-inner">
        <div>
          <p className="company-footer-product">Halex Istar CRM</p>
          <p className="company-footer-legal">
            Software desenvolvido por Almeida Lumina Ltda{" "}
            <span aria-hidden="true">·</span> CNPJ 66.399.756/0001-63
          </p>
        </div>
        <div className="company-footer-contact">
          <a href="mailto:luminatech.tech@gmail.com">luminatech.tech@gmail.com</a>
          <a href="tel:+5562996085875">(62) 99608-5875</a>
          {endContent}
        </div>
      </div>
    </footer>
  );
}
