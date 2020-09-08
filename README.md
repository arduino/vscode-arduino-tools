## Arduino Language extension for VS Code

### Quick Start
To build the Arduino Language Server VS Code extension (VSIX), execute:
```
yarn
```

It will generate a `vscode-arduino-language-server-x.x.x.vsix` file in the `./build-artifacts` folder.
In VS Code, open the `Extensions` panel, click on the ellipses (`...`) and select `Install from VSIX...`.
Or from the [_Command Palette_](https://code.visualstudio.com/docs/editor/extension-gallery#_install-from-a-vsix).

You can also start the extension in debug mode.
Open the `Debug` panel, and select the `Launch Arduino Language Server VS Code Extension` launch configuration.

### TODOs
 - [x] Use `webpack` to bundle the dependencies into a single JS module to reduce the size of the extension.
 - [ ] Integrate the VSIX packaging into the GitHub Actions.
 - [x] Wire additional language features: `Go to Definition`, `Peak Definition`, `Find All References`, etc...
 - [x] Bump up the version of the `vscode` and `vscode-languageclient` dependencies.
 - [ ] Discuss `licensing`, `author`, and `publisher`.
 - [ ] _Add your item_
