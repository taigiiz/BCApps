# syntax=docker/dockerfile:1
# =============================================================================
# MN Micro ERP - container images (build context = repository root)
#   docker build -f deploy/docker/Dockerfile --target api      -t erp-api .
#   docker build -f deploy/docker/Dockerfile --target worker   -t erp-worker .
#   docker build -f deploy/docker/Dockerfile --target migrator -t erp-migrator .
# Spec: docs/features/mn-micro-erp/18-dev-setup.md sections 10-11.
# Run every image non-root (built in) with a read-only root filesystem: compose `read_only: true` + `tmpfs: [/tmp]`.
# Secrets are mounted as files under /run/secrets (KeyPerFile provider), never passed as environment variables.
# =============================================================================
ARG DOTNET_VERSION=10.0
ARG NODE_VERSION=24

# ---------- 1. SPA (React + Vite) -> static files served by Erp.Api (BFF, same origin) ----------
FROM node:${NODE_VERSION}-bookworm-slim AS web-build
WORKDIR /src/web
COPY web/package.json web/package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY web/ ./
RUN npm run build

# ---------- 2. .NET publish (API, Worker, Migrator) ----------
FROM mcr.microsoft.com/dotnet/sdk:${DOTNET_VERSION}-noble AS dotnet-build
ARG SOURCE_SHA=unknown
ARG VERSION=0.0.0-local
WORKDIR /src
COPY global.json nuget.config Directory.Build.props Directory.Packages.props BannedSymbols.txt BannedSymbols.Domain.txt .editorconfig ./
COPY src/ src/
# ERP0001 money analyzer (Directory.Build.props wires it in when present) - enforced in image builds too.
COPY tools/Erp.Analyzers/ tools/Erp.Analyzers/
# Erp.Migrator embeds db/migrations/*.sql and db/seed/**/*.sql as resources (checksums travel with the image;
# `seed --set demo` refuses to run in Production).
COPY db/ db/
RUN --mount=type=cache,id=nuget,target=/root/.nuget/packages \
    for p in Erp.Api Erp.Worker Erp.Migrator; do \
      dotnet publish "src/$p/$p.csproj" -c Release -o "/out/$p" \
        -p:RestoreLockedMode=true -p:ContinuousIntegrationBuild=true \
        -p:SourceRevisionId="$SOURCE_SHA" -p:InformationalVersion="$VERSION" \
        -p:IncludeSourceRevisionInInformationalVersion=false || exit 1; \
    done

# ---------- 3. Runtime base: Ubuntu 24.04 + ICU (mn-MN formatting) + Noto fonts (Cyrillic incl. Ө, Ү for QuestPDF) ----------
FROM mcr.microsoft.com/dotnet/aspnet:${DOTNET_VERSION}-noble AS runtime-base
RUN apt-get update \
 && apt-get install -y --no-install-recommends fonts-noto-core fontconfig \
 && rm -rf /var/lib/apt/lists/*
ENV TZ=UTC \
    ASPNETCORE_HTTP_PORTS=8080 \
    DOTNET_gcServer=1
WORKDIR /app
USER $APP_UID
EXPOSE 8080

# ---------- 4a. API (REST + OIDC/BFF + SPA) ----------
FROM runtime-base AS api
COPY --from=dotnet-build /out/Erp.Api ./
COPY --from=web-build /src/web/dist ./wwwroot
ENTRYPOINT ["dotnet", "Erp.Api.dll"]

# ---------- 4b. Worker (outbox dispatcher + Quartz.NET jobs; health endpoints on 8080) ----------
FROM runtime-base AS worker
COPY --from=dotnet-build /out/Erp.Worker ./
ENTRYPOINT ["dotnet", "Erp.Worker.dll"]

# ---------- 4c. Migrator (runs once per deploy as erp_migrator; no fonts; "-extra" = ICU + tzdata, InvariantGlobalization is off) ----------
FROM mcr.microsoft.com/dotnet/runtime:${DOTNET_VERSION}-noble-chiseled-extra AS migrator
WORKDIR /app
COPY --from=dotnet-build /out/Erp.Migrator ./
ENTRYPOINT ["dotnet", "Erp.Migrator.dll"]
CMD ["migrate"]
