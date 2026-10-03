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

## ✅ Fait le 03/10/2026
- Clé jury secrète : `demo-judges-2026` ne marche plus (401). La nouvelle clé est dans le fichier local `.judges-key`
  (non versionné), passée au déploiement via le paramètre SAM `JudgesKey`. Console : `<url>/?key=<clé>`.
- Redéployé avec la normalisation ImportYeti corrigée (données live, Bedrock activé).
- Budget AWS « My Zero-Spend Budget » (0,01 $/mois) : alerte e-mail à hinovadigital@gmail.com.

## ⚠️ Reste à faire avant la soumission
1. **Crédits hackathon** : formulaire 150 $ AWS avant le **21 octobre** (lien dans le règlement).
2. **Vidéo** (< 3 min, YouTube public) : docs/VIDEO_SCRIPT.md.
3. **Soumission Devpost** : docs/SUBMISSION.md — remplacer `<JUDGES_KEY>` par la clé de `.judges-key`
   uniquement dans le champ privé Devpost. Date limite **vendredi 23 octobre 2026, 9h00 heure de Tahiti**.
4. Friction log : compléter les entrées 3 (inscription Alexa+) et 4 (disponibilité Alexa+ hors US).
