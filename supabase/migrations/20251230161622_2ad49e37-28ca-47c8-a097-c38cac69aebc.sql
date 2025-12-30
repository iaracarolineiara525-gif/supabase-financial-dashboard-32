-- Add status column to employee_payments table
ALTER TABLE public.employee_payments 
ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';

-- Update existing payments to 'paid' status
UPDATE public.employee_payments SET status = 'paid' WHERE status = 'pending';