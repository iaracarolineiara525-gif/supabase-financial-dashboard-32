-- Add payment_method and discount fields to fixed_bill_installments
ALTER TABLE public.fixed_bill_installments 
ADD COLUMN payment_method TEXT DEFAULT 'pix',
ADD COLUMN discount NUMERIC DEFAULT 0,
ADD COLUMN original_value NUMERIC,
ADD COLUMN notes TEXT;