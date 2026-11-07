select 'reseller_topups' as tbl, count(*) as has_proof_key
from information_schema.columns
where table_schema = 'public' and table_name = 'reseller_topups' and column_name = 'proof_key'
union all
select 'reseller_order_payments', count(*)
from information_schema.columns
where table_schema = 'public' and table_name = 'reseller_order_payments' and column_name = 'proof_key';
