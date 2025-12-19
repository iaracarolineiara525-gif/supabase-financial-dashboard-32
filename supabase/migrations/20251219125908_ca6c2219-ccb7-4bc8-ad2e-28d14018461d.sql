-- Add boleto_fee column for boleto payments
ALTER TABLE public.installments 
ADD COLUMN boleto_fee numeric NULL;

-- Add comment to explain the column
COMMENT ON COLUMN public.installments.boleto_fee IS 'Taxa do boleto por parcela';