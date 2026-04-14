SHELL := /bin/bash

CLIPROXY_DIR ?= infra/cliproxyapi
CLIPROXY_CONFIG ?= $(CLIPROXY_DIR)/config.yaml
CLIPROXY_AUTH ?= $(CLIPROXY_DIR)/auths
CLIPROXY_LOGS ?= $(CLIPROXY_DIR)/logs
CLIPROXY_IMAGE ?= eceasy/cli-proxy-api:latest
CLIPROXY_CONTAINER ?= cli-proxy-api

.PHONY: cliproxy-init cliproxy-up cliproxy-down cliproxy-logs cliproxy-health

cliproxy-init:
	mkdir -p $(CLIPROXY_AUTH) $(CLIPROXY_LOGS)
	test -f $(CLIPROXY_CONFIG) || cp $(CLIPROXY_DIR)/config.template.yaml $(CLIPROXY_CONFIG)

cliproxy-up: cliproxy-init
	docker run -d \
		--name $(CLIPROXY_CONTAINER) \
		-p 8317:8317 \
		-p 8085:8085 \
		-p 1455:1455 \
		-p 54545:54545 \
		-v "$(PWD)/$(CLIPROXY_CONFIG):/CLIProxyAPI/config.yaml" \
		-v "$(PWD)/$(CLIPROXY_AUTH):/root/.cli-proxy-api" \
		-v "$(PWD)/$(CLIPROXY_LOGS):/CLIProxyAPI/logs" \
		--restart unless-stopped \
		$(CLIPROXY_IMAGE) || true
	docker start $(CLIPROXY_CONTAINER) >/dev/null 2>&1 || true

cliproxy-down:
	docker stop $(CLIPROXY_CONTAINER) >/dev/null 2>&1 || true
	docker rm $(CLIPROXY_CONTAINER) >/dev/null 2>&1 || true

cliproxy-logs:
	docker logs -f $(CLIPROXY_CONTAINER)

cliproxy-health:
	CLIPROXY_REPO_CONFIG="$(PWD)/$(CLIPROXY_CONFIG)" bash scripts/cliproxy-health.sh
