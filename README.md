## Arduino Tools extension for VS Code

VS Code extension for Arduino Tools, such as language features and debugger. This extension is part of the [Arduino IDE 2](https://github.com/arduino/arduino-ide).

## Bugs & Issues

High quality bug reports and feature requests are valuable contributions to the project.

Before reporting an issue search existing pull requests and issues to see if it was already reported. If yfou have additional information to provide about an existing issue, please comment there. You can use the Reactions feature if you only want to express support.

Qualities of an excellent report:

- The issue title should be descriptive. Vague titles make it difficult to understand the purpose of the issue, which might cause your issue to be overlooked.
- Provide a full set of steps necessary to reproduce the issue. Demonstration code or commands should be complete and simplified to the minimum necessary to reproduce the issue.
- Be responsive. We may need you to provide additional information in order to investigate and resolve the issue.
- If you find a solution to your problem, please comment on your issue report with an explanation of how you were able to fix it and close the issue.

### Security

If you think you found a vulnerability or other security-related bug in this project, please read our
[security policy](https://github.com/arduino/vscode-arduino-tools/security/policy) and report the bug to our Security Team 🛡️
Thank you!

e-mail contact: security@arduino.cc

## How to contribute

Contributions are welcome! Here are all the ways you can contribute to the project.

### Pull Requests

To propose improvements or fix a bug, feel free to submit a PR.

### Pull request checklist

In order to ease code reviews and have your contributions merged faster, here is a list of items you can check before submitting a PR:

- Create small PRs that are narrowly focused on addressing a single concern.
- Write tests for the code you wrote.
- Open your PR against the master branch.
- Maintain clean commit history and use meaningful commit messages. PRs with messy commit history are difficult to review and require a lot of work to be merged.
- Your PR must pass all CI tests before we will merge it. If you're seeing an error and don't think it's your fault, it may not be! The reviewer will help you if there are test failures that seem not related to the change you are making.

## Build

To build the Arduino Tools VS Code extension (VSIX), execute:

```
yarn
```

It will generate a `vscode-arduino-tools-x.x.x.vsix` file in the `./build-artifacts` folder.
In VS Code, open the `Extensions` panel, click on the ellipses (`...`) and select `Install from VSIX...`.
Or from the [_Command Palette_](https://code.visualstudio.com/docs/editor/extension-gallery#_install-from-a-vsix).

You can also start the extension in debug mode.
Open the `Debug` panel, and select the `Launch Arduino Tools – VS Code Extension` launch configuration.

## Deployments

To deploy a new release of the tools you have to do the following:

- update the `version` in the package.json file
- push a tag to the repo with `v` and the version you spacified in the package.json, for example `v0.0.2-beta.1`

## Donations

This open source code was written by the Arduino team and is maintained on a daily basis with the help of the community. We invest a considerable amount of time in development, testing and optimization. Please consider [donating](https://www.arduino.cc/en/donate/) or [sponsoring](https://github.com/sponsors/arduino) to support our work, as well as [buying original Arduino boards](https://store.arduino.cc/) which is the best way to make sure our effort can continue in the long term.

## License

The code contained in this repository is licensed under the terms of the Apache 2.0 license. If you have questions about licensing please contact us at [license@arduino.cc](mailto:license@arduino.cc).
