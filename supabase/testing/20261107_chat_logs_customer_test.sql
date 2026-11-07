select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'chat_logs'
  and column_name in ('customer_name', 'customer_phone', 'question_images')
order by column_name;
