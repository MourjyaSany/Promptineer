"""Modular enterprise service layer.

auth (app.auth)        — JWT issuing/validation, password hashing
rbac                   — authority hierarchy + policy visibility rules
policy_engine          — effective-policy resolution & access enforcement
rails_engine           — guardrail orchestration (NeMo Guardrails adapter + native rails runtime)
pii_engine             — PII masking (Microsoft Presidio adapter + native regex runtime)
optimization           — token compression (LLMLingua adapter + native heuristic engine)
model_gateway          — unified multi-provider LLM gateway
file_service           — enterprise upload storage, validation, hashing
"""
