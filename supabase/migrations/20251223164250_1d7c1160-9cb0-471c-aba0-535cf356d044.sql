-- Add receipt_url column for payment receipts/statements
ALTER TABLE public.employee_payments 
ADD COLUMN receipt_url text NULL;

-- Add comment to explain the column
COMMENT ON COLUMN public.employee_payments.receipt_url IS 'URL do extrato/comprovante de pagamento';