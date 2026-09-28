# ManaLog — état du projet et prochaines étapes (mis en pause le 27/09/2026)

## Où on en est
- **Code** : github.com/Heya-56/manalog (main), 13 tests OK, licence AGPL-3.0 + COMMERCIAL.md.
- **En ligne (AWS us-west-2, compte Hinova Digital 0823-3523-4240)** :
  - Console vocale : https://wp4itqxfeguy5geyvssszy3aa40mwrro.lambda-url.us-west-2.on.aws/
  - MCP : https://wp4itqxfeguy5geyvssszy3aa40mwrro.lambda-url.us-west-2.on.aws/mcp
  - Bedrock (Claude Sonnet 4.5) activé, données ImportYeti live, DynamoDB.
- **Friction log** : 8 entrées réelles (docs/FRICTION_LOG.md).

## Coûts au repos
Rien ne tourne quand personne ne l'utilise : Lambda et DynamoDB (à la demande) = ~0 $.
Les coûts n'arrivent qu'à l'usage : Bedrock (~1 centime par requête vocale) et crédits ImportYeti (par recherche live).
Les visiteurs sans clé reçoivent les données démo et le mode sans IA (cost guard) → 0 crédit consommé.

## ⚠️ À faire avant de reprendre / avant la soumission
1. **Changer la clé jury** : `demo-judges-2026` est écrite dans le repo public, donc n'importe qui peut
   consommer des crédits ImportYeti/Bedrock avec. Avant de soumettre : choisir une clé secrète,
   la passer au déploiement (`MANALOG_DEMO_KEY` via un paramètre SAM) et ne la donner que dans les
   instructions de test Devpost (privées pour le jury). En attendant, on peut redéployer SANS `-IyKey`
   pour couper les données live.
2. **Redéployer le dernier commit** (textes sans markdown + prix cible) : `scripts/deploy.ps1 -IyKey <clé>`.
3. **Corriger la normalisation ImportYeti live** (pays / expéditions / dates vides → scores 15/100) :
   prompt prêt à coller dans le CLI, voir ci-dessous.
4. **Budget AWS** : Billing → Budgets → modèle « Zero spend » (alerte e-mail).
5. **Crédits hackathon** : formulaire 150 $ AWS avant le **21 octobre** (lien dans le règlement).
6. **Vidéo** (< 3 min, YouTube public) : docs/VIDEO_SCRIPT.md.
7. **Soumission Devpost** : docs/SUBMISSION.md — date limite **vendredi 23 octobre 2026, 9h00 heure de Tahiti**.
8. Friction log : compléter les entrées 3 (inscription Alexa+) et 4 (disponibilité Alexa+ hors US).

## Prompt prêt pour le CLI (étape 3)
```
git pull. Puis diagnostique la normalisation des données live ImportYeti : les fournisseurs remontent sans pays,
sans nombre d'expéditions ni date de dernière expédition (score 15/100 partout).
1. Avec ma clé ImportYeti, appelle GET https://data.importyeti.com/v1.0/product/glass%20bottle/suppliers?page_size=3
   et GET /v1.0/supplier/<slug du premier résultat> (en-tête IYApiKey), et montre-moi les noms de champs réels (sans la clé).
2. Adapte normSupplier et rankBuyers dans src/core/importyeti.js à ces vrais champs, sans casser le mode demo.
3. Ajoute un test avec un extrait anonymisé de la vraie réponse, npm test, redéploie avec scripts/deploy.ps1 -IyKey <ma clé>, commit et push.
4. Ajoute une entrée au FRICTION_LOG si la doc ImportYeti ne décrivait pas ces champs.
```
