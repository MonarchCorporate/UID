CREATE POLICY "mp images read auth" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'marketplace-images');
CREATE POLICY "mp images upload auth" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'marketplace-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
CREATE POLICY "mp images delete own" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'marketplace-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
