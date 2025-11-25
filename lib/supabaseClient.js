// from bilal
// lib/supabaseClient.js
import { createClient } from "@supabase/supabase-js";

// TODO: replace these with your actual values from the Supabase project
const SUPABASE_URL = "https://xjyugqxdfrbluprtgftj.supabase.co";
const SUPABASE_ANON_KEY = "<eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhqeXVncXhkZnJibHVwcnRnZnRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM2NTgwMTAsImV4cCI6MjA3OTIzNDAxMH0.oPDIDawLZnVQ7xB8hhhIERPXzqfKVsC_EPiPWBSRNGM>";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
