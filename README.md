# Find My Mouse

Extension GNOME pour localiser instantanément le pointeur de la souris avec un effet spotlight non intrusif.

---

## 📌 À propos

**Find My Mouse** est une extension légère pour **GNOME 46+** qui :
- Met en évidence le pointeur avec un **spotlight dessiné via Cairo**.
- Utilise des **événements push** pour un suivi en temps réel sans latence.
- Intègre des **animations configurables** (easing fadein/fadeout).
- Permet aux **clics de passer à travers** le spotlight (accès aux fenêtres en dessous).
- Fonctionne uniquement avec **GNOME Shell** et **GJS**.

---

## 🛠️ Installation

### Méthode manuelle
1. Cloner le dépôt :
   ```bash
   git clone https://github.com/herve-brun/find-my-mouse-example.com.git
   cd find-my-mouse-example.com
   ```
2. Copier le dossier dans le répertoire des extensions :
   ```bash
   mkdir -p ~/.local/share/gnome-shell/extensions/
   cp -r find-my-mouse@herve-brun ~/.local/share/gnome-shell/extensions/
   ```
3. Activer l'extension :
   - Redémarrer GNOME Shell : `Alt+F2` → `r` → Entrée.
   - Ouvrir **Extensions** (`gnome-extensions-app`) et activer **Find My Mouse**.

### Via GitHub
1. Télécharger la [dernière version](https://github.com/herve-brun/find-my-mouse-example.com/releases).
2. Extraire l'archive dans `~/.local/share/gnome-shell/extensions/find-my-mouse@herve-brun`.
3. Suivre l'étape 3 de la méthode manuelle.

---

## ⚙️ Fonctionnalités

- **Spotlight Cairo** : Mise en évidence du pointeur avec taille, couleur et opacité configurables.
- **Suivi précis** : Capture des mouvements et clics de la souris avec une latence minimale.
- **Animations fluides** : Easing fadein/fadeout pour le spotlight.
- **Non intrusif** : Les clics passent à travers le spotlight.
- **Événements push** : Réactivité immédiate aux actions de la souris.
- **Activation par raccourci** : Double Ctrl ou raccourci personnalisable.
- **Détection de secousse** : Active le spotlight en secouant la souris.

---

## 🎛️ Configuration

1. Ouvrir **Extensions** (`gnome-extensions-app`).
2. Sélectionner **Find My Mouse** et cliquer sur ⚙️.
3. Ajuster :
   - Activation/désactivation du spotlight.
   - Taille, couleur, opacité du spotlight.
   - Durée et type d'animation (easing).
   - Sensibilité de la détection de secousse.
   - Raccourci clavier.

---

## 📸 Captures d'écran

*(À ajouter : images du spotlight et du panneau de configuration.)*
Exemple :
```
![Spotlight activé](screenshots/spotlight.png)
![Panneau de configuration](screenshots/settings.png)
```

---

## 🐛 Dépannage

| Problème | Solution |
|----------|----------|
| Extension non visible | Redémarrer GNOME Shell (`Alt+F2` → `r` → Entrée). |
| Spotlight ne suit pas la souris | Vérifier que l'extension est activée dans `gnome-extensions-app`. |
| Latence | Désactiver les animations GNOME si nécessaire. |
| Erreur de chargement | Consulter les logs : `journalctl -f -o cat | grep -i "find my mouse"`. |

---

## 📜 Licence
GPL-3.0 – [Voir LICENSE](LICENSE).

---

## 🤝 Contribuer
Pull Requests et Issues bienvenus sur [GitHub](https://github.com/herve-brun/find-my-mouse-example.com).

---

## 📧 Contact
[Hervé Brun](mailto:herve.brun85@orange.fr)