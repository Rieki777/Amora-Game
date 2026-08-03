-- 0045: On-chain link for mechanics proposals.
-- Real decoded Hypha governance events carry only the numeric on-chain
-- proposal id, never the title marker, so the founder pastes the Hypha
-- proposal URL back after creating it and the platform links marker to id
-- (and tells the ReGen hub, which matches verified outcomes by that id).
ALTER TABLE mechanics_proposals ADD COLUMN hypha_proposal_id VARCHAR(80) NULL;
ALTER TABLE mechanics_proposals ADD COLUMN hypha_proposal_url VARCHAR(500) NULL;
ALTER TABLE mechanics_proposals ADD COLUMN hub_link_synced TINYINT(1) NOT NULL DEFAULT 0;
