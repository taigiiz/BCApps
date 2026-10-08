-- Fire the deferred guards now (ERB01 balance, deferred FKs) so they surface as business errors before COMMIT (BR-PST-53).
SET CONSTRAINTS ALL IMMEDIATE;
