ALTER TABLE transactions
  ALTER COLUMN user_id DROP NOT NULL,
  ALTER COLUMN portfolio_id DROP NOT NULL;

ALTER TABLE transactions
  DROP CONSTRAINT IF EXISTS fk_transactions_user,
  DROP CONSTRAINT IF EXISTS fk_transactions_portfolio;

ALTER TABLE transactions
  ADD CONSTRAINT fk_transactions_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_transactions_portfolio
    FOREIGN KEY (portfolio_id) REFERENCES portfolios(id) ON DELETE SET NULL;
