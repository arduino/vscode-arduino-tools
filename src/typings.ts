export interface DaemonAddress {
  /**
   * The host where the Arduino CLI daemon is available.
   */
  readonly hostname: string;
  /**
   * The port where the Arduino CLI daemon is listening.
   */
  readonly port: number;
  /**
   * The [id](https://arduino.github.io/arduino-cli/latest/rpc/commands/#instance) of the initialized core Arduino client instance.
   */
  readonly instance: number;
}

export interface BoardIdentifier {
  /**
   * The FQBN of the the board.
   */
  readonly fqbn: string;
  /**
   * The human-readable name of the board. Its purpose is solely for the UI. When falsy, the `fqbn` is used.
   */
  readonly name?: string;
}
