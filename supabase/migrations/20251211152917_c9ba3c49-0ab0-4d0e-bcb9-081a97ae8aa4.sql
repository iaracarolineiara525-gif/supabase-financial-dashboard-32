-- Add entry_date and exit_date columns to clients table
ALTER TABLE public.clients 
ADD COLUMN entry_date date DEFAULT CURRENT_DATE,
ADD COLUMN exit_date date;

-- Add expected_end_date column to installments table
ALTER TABLE public.installments 
ADD COLUMN expected_end_date date;