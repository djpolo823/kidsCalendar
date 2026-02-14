-- CRÍTICO: Habilitar RLS en la tabla profiles
-- Esto es necesario para que las políticas RLS se apliquen correctamente
-- y los datos de family_id se persistan en la base de datos

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
