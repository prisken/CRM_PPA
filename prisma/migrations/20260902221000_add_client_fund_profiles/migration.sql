-- ClientFundProfile + FundRecommendation: ILAS fund advisory plans (Phase 3).
CREATE TABLE "client_fund_profiles" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "deal_id" TEXT,
    "strategy" TEXT NOT NULL,
    "risk_max_dd" DOUBLE PRECISION NOT NULL,
    "expected_1y" DOUBLE PRECISION NOT NULL,
    "min_yield" DOUBLE PRECISION,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "client_fund_profiles_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "fund_recommendations" (
    "id" TEXT NOT NULL,
    "profile_id" TEXT NOT NULL,
    "fund_code" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "verdict" TEXT,
    "tag" TEXT,
    "expected_1y" DOUBLE PRECISION,
    "max_dd_pct" DOUBLE PRECISION,
    "yield_pct" DOUBLE PRECISION,
    "risk_fit" TEXT,
    "snapshot" JSONB NOT NULL,
    "accepted" BOOLEAN,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "fund_recommendations_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "client_fund_profiles_client_id_active_idx" ON "client_fund_profiles"("client_id", "active");
CREATE INDEX "fund_recommendations_profile_id_idx" ON "fund_recommendations"("profile_id");
ALTER TABLE "client_fund_profiles" ADD CONSTRAINT "client_fund_profiles_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fund_recommendations" ADD CONSTRAINT "fund_recommendations_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "client_fund_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
