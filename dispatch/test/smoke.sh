#!/usr/bin/env bash
# End-to-end smoke test for ManaLog Dispatch.
# Usage: npx wrangler dev --env test --port 8790  (in another shell), then: BASE=http://localhost:8790 bash test/smoke.sh
set -u
BASE=${BASE:-http://localhost:8790}
PASS=0; FAIL=0
T=$(mktemp -d); C="$T/console"; D="$T/driver"; O="Origin: $BASE"
check() { if eval "$2" >/dev/null 2>&1; then PASS=$((PASS+1)); echo "  ✓ $1"; else FAIL=$((FAIL+1)); echo "  ✗ $1"; fi; }
code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
loc() { curl -s -o /dev/null -w '%{redirect_url}' "$@"; }
R=$RANDOM

echo "1. Accès"
check "accueil public" '[ "$(code $BASE/)" = 200 ]'
check "console protégée" '[[ "$(loc $BASE/console)" == */connexion ]]'
check "mauvais mot de passe refusé" '[[ "$(loc -H "$O" -d password=faux $BASE/connexion)" == *err=* ]]'
check "connexion console" '[[ "$(loc -c "$C" -H "$O" -d password=manalog-test $BASE/connexion)" == */console ]]'
check "POST depuis un autre site refusé" '[ "$(code -b "$C" -H "Origin: https://evil.example" -d name=x $BASE/console/coursiers)" = 403 ]'

echo "2. Coursiers et tarifs"
check "ajout d’un coursier" '[[ "$(loc -b "$C" -H "$O" --data-urlencode "name=Moana $R" -d phone=87000000 -d vehicle=Scooter -d pin=4321 $BASE/console/coursiers)" == *ok=* ]]'
check "PIN invalide refusé" '[[ "$(loc -b "$C" -H "$O" -d name=X -d pin=12 $BASE/console/coursiers)" == *err=* ]]'
DID=$(curl -s $BASE/chauffeur | tr '\n' ' ' | grep -o "value=\"[a-f0-9]\{24\}\">Moana $R" | grep -o '[a-f0-9]\{24\}')
check "coursier visible dans l’app" '[ -n "$DID" ]'
check "tarifs modifiables" '[[ "$(loc -b "$C" -H "$O" -d urbain=1200 -d ile=1500 -d moorea=2500 -d iles=3000 -d international=2000 -d kg_included=5 -d per_extra_kg=200 -d per_extra_parcel=300 $BASE/console/tarifs)" == *ok=* ]]'

echo "3. Commandes"
check "commande incomplète refusée" '[[ "$(loc -b "$C" -H "$O" -d shipper_name=A -d pickup_address=B -d recipient_name=C -d dest_address=D -d dest_type=tahiti $BASE/console/nouvelle)" == *commune* ]]'
check "international sans valeur déclarée refusée" '[[ "$(loc -b "$C" -H "$O" -d shipper_name=A -d pickup_address=B -d recipient_name=C -d dest_address=D -d dest_type=international --data-urlencode "dest_country=France (métropole)" $BASE/console/nouvelle)" == *CN23* ]]'
L=$(loc -b "$C" -H "$O" --data-urlencode "shipper_name=Monoï Tiare $R" -d shipper_phone=87111111 --data-urlencode "pickup_address=PK 12,5 côté mer" -d pickup_lat=-17.62 -d pickup_lng=-149.61 --data-urlencode "recipient_name=Hina T" --data-urlencode "dest_address=Servitude Tefaa, PK 4" -d dest_type=tahiti -d dest_commune=Papara -d dest_lat=-17.75 -d dest_lng=-149.55 -d parcels=2 -d weight_kg=7 --data-urlencode "description=Monoï" $BASE/console/nouvelle)
OID=$(echo "$L" | grep -o '/console/commandes/[a-f0-9]\{24\}' | cut -d/ -f4)
check "commande Tahiti créée, prix calculé (1500 + 2 kg × 200 + 1 colis × 300 = 2 200 F)" '[ -n "$OID" ] && [[ "$L" == *2%20200* ]]'
P=$(curl -s -b "$C" $BASE/console/commandes/$OID)
CODE=$(echo "$P" | grep -o 'ML-[A-Z0-9]\{6\}' | head -1)
check "fiche commande avec code de suivi" '[ -n "$CODE" ]'
check "étiquette imprimable" 'curl -s -b "$C" $BASE/console/commandes/$OID/etiquette | grep -q "$CODE"'
check "pas de CN23 pour Tahiti" '[ "$(code -b "$C" $BASE/console/commandes/$OID/cn23)" = 404 ]'
check "suivi public" 'curl -s $BASE/suivi/$CODE | grep -q "Nouvelle"'
check "suivi : code inconnu" '[ "$(code $BASE/suivi/ML-XXXXXX)" = 404 ]'
check "assignation au coursier" '[[ "$(loc -b "$C" -H "$O" -d driver_id=$DID $BASE/console/commandes/$OID/assigner)" == *ok=* ]]'
check "suivi public : le nom du coursier n’apparaît pas" '! curl -s $BASE/suivi/$CODE | grep -q "Moana $R"'
check "carte des commandes en cours" 'curl -s -b "$C" $BASE/console | grep -q "$CODE"'

echo "4. App coursier"
check "mauvais PIN refusé" '[[ "$(loc -H "$O" -d driver_id=$DID -d pin=0000 $BASE/chauffeur/connexion)" == *err=* ]]'
check "connexion coursier" '[[ "$(loc -c "$D" -H "$O" -d driver_id=$DID -d pin=4321 $BASE/chauffeur/connexion)" == */chauffeur ]]'
check "la course apparaît" 'curl -s -b "$D" $BASE/chauffeur | grep -q "$CODE"'
printf '\xff\xd8\xff\xe0\x00\x10JFIF\x00' > "$T/p.jpg"
check "ramassage avec photo et GPS" '[[ "$(loc -b "$D" -H "$O" -F status=picked_up -F lat=-17.62 -F lng=-149.61 -F "photo=@$T/p.jpg;type=image/jpeg" $BASE/chauffeur/commandes/$OID/etape)" == *ok=* ]]'
check "étape sautée refusée (déjà ramassée)" '[[ "$(loc -b "$D" -H "$O" -F status=picked_up $BASE/chauffeur/commandes/$OID/etape)" == *err=* ]]'
check "livraison" '[[ "$(loc -b "$D" -H "$O" -F status=delivered -F "note=Remis en main propre" $BASE/chauffeur/commandes/$OID/etape)" == *ok=* ]]'
check "suivi public : livrée" 'curl -s $BASE/suivi/$CODE | grep -q "Remis en main propre"'
EID=$(curl -s -b "$C" $BASE/console/commandes/$OID | grep -o '/console/photo/[0-9]*' | head -1)
check "photo visible en console seulement" '[ -n "$EID" ] && [ "$(code -b "$C" $BASE$EID)" = 200 ] && [ "$(code $BASE$EID)" != 200 ]'
check "un coursier n’accède pas à la console" '[[ "$(loc -b "$D" $BASE/console)" == */connexion ]]'

echo "5. API (ManaShop)"
H="Authorization: Bearer test-api-key-123"
check "API sans clé refusée" '[ "$(code -X POST $BASE/api/v1/orders)" = 401 ]'
J="{\"source\":\"manashop\",\"external_ref\":\"cmd-$R\",\"shipper_name\":\"Boutique Test\",\"pickup_address\":\"Papeete\",\"recipient_name\":\"Teva\",\"dest_type\":\"international\",\"dest_address\":\"12 rue de Lyon\",\"dest_country\":\"France (métropole)\",\"description\":\"Collier perle\",\"declared_value_xpf\":9800,\"weight_kg\":0.3}"
A=$(curl -s -X POST -H "$H" -H "content-type: application/json" -d "$J" $BASE/api/v1/orders)
check "commande créée par l’API (international, 2 000 F)" 'echo "$A" | grep -q "\"price_xpf\":2000" && echo "$A" | grep -q tracking_url'
check "même commande renvoyée sans doublon" 'curl -s -X POST -H "$H" -H "content-type: application/json" -d "$J" $BASE/api/v1/orders | grep -q "\"duplicate\":true"'
AC=$(echo "$A" | grep -o 'ML-[A-Z0-9]\{6\}' | head -1)
check "statut par l’API" 'curl -s -H "$H" $BASE/api/v1/orders/$AC | grep -q "\"status\":\"created\""'
AOID=$(echo "$A" | grep -o '"id":"[a-f0-9]*"' | cut -d'"' -f4)
check "CN23 préremplie" 'curl -s -b "$C" $BASE/console/commandes/$AOID/cn23 | grep -q "Collier perle"'
check "devis par l’API (Moorea)" 'curl -s -X POST -H "$H" -H "content-type: application/json" -d "{\"dest_type\":\"iles\",\"dest_island\":\"Moorea\",\"weight_kg\":2}" $BASE/api/v1/quote | grep -q "\"total\":2500"'

rm -rf "$T"
echo "Résultat : $PASS réussis, $FAIL échoués"
[ "$FAIL" = 0 ]
