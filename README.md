🌑 Dark Moon Dice Companion

A simple, real-time web app to help play Dark Moon by handling concealed dice rolls on players’ phones.

This app replaces physical dice rolling for Dark Moon, making rolls:

Concealed when required

Selective (players reveal only allowed dice)

Harder to cheat

No accounts. No setup beyond opening a link.


What this app does

Players join the same room from their phones

Each player rolls dice privately

The app logs all actions in a shared Table Feed

Players choose which dice to reveal publicly

Other dice remain hidden and are discarded from view

This keeps the tension and secrecy of Dark Moon while removing ambiguity or accidental cheating.

🎲 Supported dice

Custom Dark Moon dice are built in:

Black dice: +4, +2, +1, -2, -2, -2

Red dice: +3, +1, -1, -2, -2, -2

Blue dice: +5, +3, -1, -2, -2, -2

Yellow (Corporation) dice: 0, -1, -1, -2, -2, -3

All dice outcomes are generated server-side.

🧩 App sections
1️⃣ Action Rolls

For:

Repair Shields

Repair Outpost

Repair Life Support

Lone Wolf

Rules:

Roll up to 3 dice

Dice count is concealed from other players

You may reveal exactly 1 die

Other dice are hidden and removed from your screen

2️⃣ Corporation Dice

For rolling yellow corporation dice.

Options:

Roll 2 yellow dice

Roll 3 yellow dice

Rules:

Dice count is public

You may reveal exactly 1 die

Other dice remain hidden and are discarded from view

3️⃣ Task Rolls

For malfunction or task contributions.

Rules:

Roll up to 6 dice

Dice count is concealed

You may reveal any number of dice

Unrevealed dice are removed after reveal

🌍 Language support

English 🇬🇧

Spanish 🇪🇸

Language can be switched at any time.
All table logs are translated on the client side.

📱 How to use (players)

One player opens the app and creates a room

Others join using the room code

Everyone opens the app on their phone

Use the appropriate section to roll dice

Reveal only the dice allowed by Dark Moon rules

Continue playing as normal

No downloads required.

🛠️ Running locally (optional)

If you want to host it yourself on a laptop for local play:

Requirements

Node.js 18+

Server
cd server
npm install
npm start


Server runs on:

http://localhost:4000

Client
cd client
npm install
npm run dev -- --host


Open on:

Computer: http://localhost:5173

Phone (same Wi-Fi): http://<your-computer-ip>:5173

Example:

http://192.168.1.50:5173

⚠️ What this app does not do

It does not enforce full Dark Moon rules

It does not track roles, infection, votes, or game state

It does not replace the board or cards

This is intentionally a lightweight dice companion, not a full digital adaptation.

🤝 Why this exists

Dark Moon relies heavily on:

hidden information

trust

selective reveals

This app helps preserve those mechanics while avoiding:

accidental rerolls

unclear dice

“trust me” moments at the table

Disclaimer

This project is an unofficial fan-made companion app.
Dark Moon and all related content belong to their respective owners.
