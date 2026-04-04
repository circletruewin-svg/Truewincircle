Put your custom game images in this folder tree.

Recommended files:

- `game-assets/aviator/plane.png`
- `game-assets/coinflip/heads.png`
- `game-assets/coinflip/tails.png`
- `game-assets/teenpatti/card-back.png`
- `game-assets/dragontiger/dragon.png`
- `game-assets/dragontiger/tiger.png`
- `game-assets/andarbahar/joker.png`
- `game-assets/diceroll/dice-1.png`
- `game-assets/diceroll/dice-2.png`
- `game-assets/diceroll/dice-3.png`
- `game-assets/diceroll/dice-4.png`
- `game-assets/diceroll/dice-5.png`
- `game-assets/diceroll/dice-6.png`
- `game-assets/colorprediction/red.png`
- `game-assets/colorprediction/green.png`
- `game-assets/colorprediction/violet.png`

As soon as these files are added, the frontend will automatically start using them.

Recommended sizing:

- `aviator/plane.png`: around `220x120` transparent PNG
- `coinflip/heads.png` and `coinflip/tails.png`: around `256x256`
- `teenpatti/card-back.png`: around `300x420`
- `dragontiger/dragon.png` and `dragontiger/tiger.png`: around `320x480`
- `andarbahar/joker.png`: around `320x480`
- `diceroll/dice-1.png` to `dice-6.png`: square icons around `256x256`
- `colorprediction/red.png`, `green.png`, `violet.png`: square icons around `256x256`

How replacement works:

- keep the same folder and same file name
- replace the dummy PNG with your real image
- push and deploy, then the website will automatically show the new asset

How most websites handle this:

- many use separate PNG, WEBP, or SVG assets for each game visual
- some use SVG or canvas animation for smoother motion
- Aviator plane/fan is usually either a transparent plane PNG, an animated image, or an SVG with a rotating propeller

Best setup for this project right now:

- keep one `plane.png` for Aviator first
- if you want the front fan/propeller to rotate later, we can split it into `plane-body.png` and `propeller.png` and animate the propeller with CSS
