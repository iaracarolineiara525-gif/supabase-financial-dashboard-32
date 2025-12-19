-- Add gross_value and net_value columns for card sales with machine fees
ALTER TABLE public.installments 
ADD COLUMN gross_value numeric NULL,
ADD COLUMN net_value numeric NULL,
ADD COLUMN payment_method text NULL DEFAULT 'cash';

-- Add comment to explain the columns
COMMENT ON COLUMN public.installments.gross_value IS 'Valor bruto da venda em cartão (antes das taxas)';
COMMENT ON COLUMN public.installments.net_value IS 'Valor líquido da venda em cartão (após taxas da máquina)';
COMMENT ON COLUMN public.installments.payment_method IS 'Método de pagamento: cash, card, pix, etc.';