-- Create storage bucket for payment receipts
INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-receipts', 'payment-receipts', true);

-- Create policies for payment receipts bucket
CREATE POLICY "Payment receipts are publicly accessible" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'payment-receipts');

CREATE POLICY "Authenticated users can upload payment receipts" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'payment-receipts');

CREATE POLICY "Authenticated users can update payment receipts" 
ON storage.objects 
FOR UPDATE 
USING (bucket_id = 'payment-receipts');

CREATE POLICY "Authenticated users can delete payment receipts" 
ON storage.objects 
FOR DELETE 
USING (bucket_id = 'payment-receipts');