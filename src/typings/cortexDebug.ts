/* eslint-disable */
/**
 * Launch Configuration Attributes for `cortex-debug@1.5.1`. See the list of all available attributes [here](https://github.com/Marus/cortex-debug/blob/v1.5.1/debug_attributes.md).
 *
 * This file was automatically generated. **DO NOT MODIFY IT BY HAND**.
 */

export interface CortexDebugLaunchAttributes {
  /**
   * GDB Server type - supported types are jlink, openocd, pyocd, pe, stlink, stutil, qemu, bmp and external
   */
  servertype?:
    | 'jlink'
    | 'openocd'
    | 'pyocd'
    | 'stutil'
    | 'stlink'
    | 'bmp'
    | 'pe'
    | 'qemu'
    | 'external';
  /**
   * Directory to run commands from
   */
  cwd?: string;
  /**
   * Additional arguments to pass to GDB command line
   */
  debuggerArgs?: unknown[];
  /**
   * Additional GDB Commands to be executed at the start of the main launch sequence (immediately after attaching to target).
   */
  preLaunchCommands?: string[];
  /**
   * Additional GDB Commands to be executed after the main launch sequence has finished.
   */
  postLaunchCommands?: string[];
  /**
   * Additional GDB Commands to be executed at the beginning of the restart sequence (after interrupting execution).
   */
  preRestartCommands?: string[];
  /**
   * Additional GDB Commands to be executed at the end of the restart sequence.
   */
  postRestartCommands?: string[];
  /**
   * You can use this to property to override the commands that are normally executed as part of flashing and launching the target. In most cases it is preferable to use preLaunchCommands and postLaunchCommands to customize the GDB launch sequence.
   */
  overrideLaunchCommands?: string[];
  /**
   * You can use this to property to override the commands that are normally executed as part of restarting the target. In most cases it is preferable to use preRestartCommands and postRestartCommands to customize the GDB restart sequence.
   */
  overrideRestartCommands?: string[];
  /**
   * Additional GDB Commands to be executed at the end of the start sequence, after a debug session has already started and runToEntryPoint is not specified.
   */
  postStartSessionCommands?: string[];
  /**
   * Additional GDB Commands to be executed at the end of the re-start sequence, after a debug session has already started.
   */
  postRestartSessionCommands?: string[];
  /**
   * You can supply a regular expression (https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions) in the configuration property to override the output from the GDB Server that is looked for to determine if the GDB Server has started. Under most circumstances this will not be necessary - but could be needed as a result of a change in the output of a GDB Server making it incompatible with cortex-debug. This property has no effect for bmp or external GDB Server types.
   */
  overrideGDBServerStartedRegex?: string;
  /**
   * CPU Type Selection - used for QEMU server type
   */
  cpu?: 'cortex-m3' | 'cortex-m4';
  /**
   * Machine Type Selection - used for QEMU server type
   */
  machine?: 'lm3s811evb' | 'lm3s6965evb';
  /**
   * Target Device Identifier
   */
  device?: string;
  /**
   * RTOS being used. For JLink this can be Azure, ChibiOS, embOS, FreeRTOS, NuttX, Zephyr or the path to a custom JLink RTOS Plugin library. For OpenOCD this can be ChibiOS, eCos, embKernel, FreeRTOS, mqx, nuttx, ThreadX, uCOS-III, or auto.
   */
  rtos?: string;
  /**
   * This setting can be used to override the armToolchainPath user setting for a particular launch configuration. This should be the path where arm-none-eabi-gdb, arm-none-eabi-objdump and arm-none-eabi-nm are located.
   */
  armToolchainPath?: string;
  /**
   * This setting can be used to override the toolchainPrefix user setting for a particular launch configuration.
   */
  toolchainPrefix?: string;
  /**
   * This setting can be used to override the GDB Server path user/workspace setting for a particular launch configuration. It is the full pathname to the executable or name of executable if it is in your PATH
   */
  serverpath?: string;
  /**
   * This setting can be used to override the GDB path user/workspace setting for a particular launch configuration. This should be the full pathname to the executable (or name of the executable if it is in your PATH). Note that other toolchain executables with the configured prefix must still be available.
   */
  gdbPath?: string;
  /**
   * This setting can be used to override the objdump (used to find globals/statics) path user/workspace setting for a particular launch configuration. This should be the full pathname to the executable (or name of the executable if it is in your PATH). Note that other toolchain executables with the configured prefix must still be available. The program 'nm' is also expected alongside
   */
  objdumpPath?: string;
  /**
   * Additional arguments to pass to GDB Server command line
   */
  serverArgs?: string[];
  /**
   * Path of executable for symbols and program information. See also `loadFiles`, `symbolFiles`
   */
  executable: string;
  /**
   * List of files (hex/bin/elf files) to load/program instead of the executable file. Symbols are not loaded (see `symbolFiles`). Can be an empty list to specify none. If this property does not exist, then the executable is used to program the device
   */
  loadFiles?: string[];
  /**
   * List of ELF files to load symbols from instead of the executable file. Program information is ignored (see `loadFiles`). Can be an empty list to specify none. If this property does not exist, then the executable is used for symbols
   */
  symbolFiles?: {
    /**
     * Pathname of an ELF file for symbols
     */
    file: string;
    /**
     * Optional offset to apply to all sections of the ELF file. Use a string strarting with '0x' for a hexadecimal number
     */
    offset?: number | string;
    /**
     * Optional: Load the TEXT section at the specified 'textaddress'. Use a string strarting with '0x' for a hexadecimal number
     */
    textaddress?: number | string;
    sections?: {
      /**
       * Section name
       */
      name: string;
      /**
       * Base address for section. Use a string strarting with '0x' for a hexadecimal number
       */
      address: number | string;
      [k: string]: unknown;
    }[];
    [k: string]: unknown;
  }[];
  /**
   * For externally controlled GDB Servers you must specify the GDB target to connect to. This can either be a "hostname:port" combination or path to a serial port
   */
  gdbTarget?: string;
  /**
   * Deprecated: please use 'runToEntryPoint' instead.
   */
  runToMain?: boolean;
  /**
   * Applies to Restart/Reset/Launch, halt debugger after a reset. Ignored if `runToEntryPoint` is used.
   */
  breakAfterReset?: boolean;
  /**
   * Applies to Launch/Restart/Reset, ignored for Attach. If enabled the debugger will run until the start of the given function.
   */
  runToEntryPoint?: string;
  /**
   * Number of processors/cores in the target device.
   */
  numberOfProcessors?: number;
  /**
   * The processor you want to debug. Zero based integer index. Must be less than 'numberOfProcessors'
   */
  targetProcessor?: number;
  chainedConfigurations?: {
    /**
     * Enable/Disable entire set of chained configurations
     */
    enabled?: boolean;
    /**
     * Related or independent server sessions. Set to true for servers like 'JLink'. Inherited by children
     */
    detached?: boolean;
    /**
     * Are Restart/Reset/Stop/Disconnect shared? All life-cycle management done as a group by parent/root. Inherited by children
     */
    lifecycleManagedByParent?: boolean;
    /**
     * Event to wait for. 'postStart' means wait for gdb-server connecting, 'postInit' is after init commands are completed by gdb. Inherited by children
     */
    waitOnEvent?: 'postStart' | 'postInit';
    /**
     * Default delay in milliseconds for a certain amount of milliseconds to begin launch. Inherited by children
     */
    delayMs?: number;
    /**
     * Values to override/set in this child configuration. A set of name/value pairs. Set value to 'null' (no quotes) to delete. Sorry, no IntelliSense
     */
    overrides?: {
      [k: string]: unknown;
    };
    /**
     * List of properties to inherit from parent. Sorry, no IntelliSense
     */
    inherits?: string[];
    launches?: {
      /**
       * Name of launch configuration. Sorry, no IntelliSense
       */
      name?: string;
      /**
       * Folder to use for this configuration. Where .vscode/launch.json exists. Default is same folder as parent. Use either the full path name or the base-name of the folder
       */
      folder?: string;
      /**
       * Enable/Disable this configuration
       */
      enabled?: boolean;
      /**
       * Related or independent server sessions. Set to true for servers like 'JLink'
       */
      detached?: boolean;
      /**
       * Wait for an event. 'postStart' means wait for gdb-server connecting, 'postInit' is after init commands are completed by gdb
       */
      waitOnEvent?: 'postStart' | 'postInit';
      /**
       * Delay in milliseconds for a certain amount of milliseconds to begin launch
       */
      delayMs?: number;
      /**
       * Are Restart/Reset/Stop/Disconnect shared? All life-cycle management done as a group by parent/root
       */
      lifecycleManagedByParent?: boolean;
      /**
       * Values to override/set in this child configuration. A set of name/value pairs. Set value to 'null' (no quotes) to delete. Sorry, no IntelliSense
       */
      overrides?: {
        [k: string]: unknown;
      };
      /**
       * List of properties to inherit from parent. Sorry, no IntelliSense
       */
      inherits?: string[];
      [k: string]: unknown;
    }[];
    [k: string]: unknown;
  };
  graphConfig?: (
    | {
        /**
         * Create annotations on the graph for when the target processor starts and stops execution. (green line for starting execution, red line for stopping execution).
         */
        annotate?: boolean;
        /**
         * Label for Graph
         */
        label: string;
        /**
         * Maximum value for the X-Axis
         */
        maximum: number;
        /**
         * Minimum value for the Y-Axis
         */
        minimum: number;
        /**
         * Plot configurations. Data sources must be configured for "graph" (or "advanced" with a decoder that sends graph data) in the "swoConfig" section
         */
        plots: {
          color?: string;
          /**
           * Graph Data Source Id for the plot.
           */
          graphId: string;
          /**
           * A label for this data set
           */
          label?: string;
          [k: string]: unknown;
        }[];
        /**
         * Length of time (seconds) to be plotted on screen.
         */
        timespan?: number;
        type?: 'realtime';
        [k: string]: unknown;
      }
    | {
        /**
         * Label for graph
         */
        label: string;
        /**
         * The amount of time (seconds) that the XY Plot will show the trace for.
         */
        timespan?: number;
        type?: 'x-y-plot';
        /**
         * Graph Data Source Id for the X axis
         */
        xGraphId: string;
        /**
         * Maximum value on the X-Axis
         */
        xMaximum?: number;
        /**
         * Minimum value on the X-Axis
         */
        xMinimum?: number;
        /**
         * Graph Data Source Id Port for the Y axis
         */
        yGraphId: string;
        /**
         * Maximum value on the Y-Axis
         */
        yMaximum?: number;
        /**
         * Minimum value on the Y-Axis
         */
        yMinimum?: number;
        [k: string]: unknown;
      }
  )[];
  /**
   * Used to debug this extension. Prints all GDB responses to the console. 'raw' prints gdb responses, 'parsed' prints results after parsing, 'both' prints both. 'vscode' shows raw and VSCode interactions
   */
  showDevDebugOutput?: 'none' | 'parsed' | 'raw' | 'both' | 'vscode';
  /**
   * Show timestamps when 'showDevDebugOutput' is enabled
   */
  showDevDebugTimestamps?: boolean;
  /**
   * Path to a CMSIS SVD file describing the peripherals of the microcontroller; if not supplied then one may be selected based upon the 'device' entered.
   */
  svdFile?: string;
  /**
   * If the gap between registers is less than this threshold (multiple of 8), combine into a single read from device. -1 means never combine registers and is very slow
   */
  svdAddrGapThreshold?: number;
  /**
   * SEGGER's Real Time Trace (RTT) and supported by JLink, OpenOCD and perhaps others in the future
   */
  rttConfig?: {
    /**
     * Enable/Disable RTT
     */
    enabled?: boolean;
    /**
     * Address to start searching for the RTT control block. Use "auto" for Cortex-Debug to use the address from elf file
     */
    address?: string;
    /**
     * Number of bytes to search for the RTT control block. If 'address' is 'auto', use ONLY if you have a custom RTT implementation
     */
    searchSize?: number;
    /**
     * A string to search for to find the RTT control block. If 'address' is 'auto', use ONLY if you have a custom RTT implementation
     */
    searchId?: string;
    /**
     * number of milliseconds (> 0) to wait for check for data on out channels
     */
    polling_interval?: number;
    /**
     * When true, clears the search-string. Only applicable when address is "auto"
     */
    clearSearch?: boolean;
    /**
     * SWO Decoder Configuration
     */
    decoders?: (
      | {
          /**
           * A label for RTT Console
           */
          label?: string;
          /**
           * RTT Channel Number (0 to 15)
           */
          port: number;
          /**
           * 'console' with text input/output, 'binary' is for converting byte stream to other data types
           */
          type?: 'console' | 'binary';
          /**
           * Prompt to use for RTT Console
           */
          prompt?: string;
          /**
           * Don't use a prompt for RTT Console
           */
          noprompt?: boolean;
          /**
           * append to screen/logfile when another connection is made
           */
          noclear?: boolean;
          /**
           * log all raw data (input and output) to specified file
           */
          logfile?: string;
          /**
           * Add timestamps while printing for 'console' type. 'binary' type always prints timestamps
           */
          timestamp?: boolean;
          /**
           * How binary data bytes are converted into a number. All little-endian
           */
          encoding?: 'unsigned' | 'signed' | 'Q16.16' | 'float';
          /**
           * How keyoard input is encoded Cooked mode only
           */
          iencoding?: 'ascii' | 'utf8' | 'ucs2' | 'utf16le';
          /**
           * Binary only: This setting will scale the raw value from the ITM port by the specified value. Can be used, for example, to scale a raw n-bit ADC reading to a voltage value. (e.g to scale a 12-bit ADC reading to a 3.3v scale you would need a scale value of 3.3/4096 = 0.0008056640625
           */
          scale?: number;
          /**
           * Experimental: 'disabled' means no stdin. 'raw' and 'rawecho' sends chars as they are typed.
           * 'rawecho' will echo chars and process RETURN keys. Even CTRL-C CTRL-D are passed on
           */
          inputmode?: 'cooked' | 'raw' | 'rawecho' | 'disabled';
          [k: string]: unknown;
        }
      | {
          /**
           * This property is only used for binary and graph output formats.
           */
          encoding?: 'unsigned' | 'signed' | 'Q16.16' | 'float';
          /**
           * The identifier to use for this data in graph configurations.
           */
          graphId: string;
          /**
           * RTT Channel Number
           */
          port: number;
          /**
           * This setting will scale the raw value from the ITM port by the specified value. Can be used, for example, to scale a raw n-bit ADC reading to a voltage value. (e.g to scale a 12-bit ADC reading to a 3.3v scale you would need a scale value of 3.3/4096 = 0.0008056640625
           */
          scale?: number;
          type?: 'graph';
          [k: string]: unknown;
        }
      | {
          config?: {
            [k: string]: unknown;
          };
          /**
           * Path to a javascript module to implement the decoding functionality.
           */
          decoder: string;
          /**
           * RTT Channel Numbers
           */
          ports: number[];
          type?: 'advanced';
          [k: string]: unknown;
        }
    )[];
    [k: string]: unknown;
  };
  swoConfig?: {
    /**
     * Target CPU frequency in Hz.
     */
    cpuFrequency?: number;
    /**
     * Enable SWO decoding.
     */
    enabled?: boolean;
    /**
     * Source for SWO data. Can either be "probe" to get directly from debug probe, or a serial port device to use a serial port external to the debug probe.
     */
    source?: 'probe' | 'socket' | 'serial' | 'file';
    /**
     * Path name when source is "file" or "serial". Typically a /path-name or a serial-port-name
     */
    swoPath?: string;
    /**
     * When server is "external" && source is "socket", port to connect to. Format [host:]port
     */
    swoPort?: string;
    /**
     * SWO Decoder Configuration
     */
    decoders?: (
      | {
          /**
           * A label for the output window.
           */
          label?: string;
          /**
           * ITM Port Number
           */
          port: number;
          /**
           * If true, switches to this output when starting a debug session.
           */
          showOnStartup?: boolean;
          /**
           * Add timestamps while printing
           */
          timestamp?: boolean;
          type?: 'console';
          encoding?: 'ascii' | 'utf8' | 'ucs2' | 'utf16le';
          /**
           * log all raw data to specified file
           */
          logfile?: string;
          [k: string]: unknown;
        }
      | {
          /**
           * This property is only used for binary and graph output formats.
           */
          encoding?: 'unsigned' | 'signed' | 'Q16.16' | 'float';
          /**
           * A label for the output window.
           */
          label?: string;
          /**
           * ITM Port Number
           */
          port: number;
          /**
           * This setting will scale the raw value from the ITM port by the specified value. Can be used, for example, to scale a raw n-bit ADC reading to a voltage value. (e.g to scale a 12-bit ADC reading to a 3.3v scale you would need a scale value of 3.3/4096 = 0.0008056640625
           */
          scale?: number;
          type?: 'binary';
          /**
           * log all raw data to specified file
           */
          logfile?: string;
          [k: string]: unknown;
        }
      | {
          /**
           * This property is only used for binary and graph output formats.
           */
          encoding?: 'unsigned' | 'signed' | 'Q16.16' | 'float';
          /**
           * The identifier to use for this data in graph configurations.
           */
          graphId: string;
          /**
           * ITM Port Number
           */
          port: number;
          /**
           * This setting will scale the raw value from the ITM port by the specified value. Can be used, for example, to scale a raw n-bit ADC reading to a voltage value. (e.g to scale a 12-bit ADC reading to a 3.3v scale you would need a scale value of 3.3/4096 = 0.0008056640625
           */
          scale?: number;
          type?: 'graph';
          /**
           * log all raw data to specified file
           */
          logfile?: string;
          [k: string]: unknown;
        }
      | {
          config?: {
            [k: string]: unknown;
          };
          /**
           * Path to a javascript module to implement the decoding functionality.
           */
          decoder: string;
          /**
           * ITM Port Numbers
           */
          ports: number[];
          type?: 'advanced';
          [k: string]: unknown;
        }
    )[];
    /**
     * SWO frequency in Hz.
     */
    swoFrequency?: number;
    [k: string]: unknown;
  };
  /**
   * IP Address for networked J-Link Adapter
   */
  ipAddress?: string;
  /**
   * J-Link or ST-LINK Serial Number - only needed if multiple J-Links/ST-LINKs are connected to the computer
   */
  serialNumber?: string;
  /**
   * Debug Interface type to use for connections (defaults to SWD) - Used for J-Link, ST-LINK and BMP probes.
   */
  interface?: 'swd' | 'jtag' | 'cjtag';
  /**
   * J-Link script file - optional input file for customizing J-Link actions.
   */
  jlinkscript?: string;
  /**
   * OpenOCD command(s) after configuration files are loaded (-c options)
   */
  openOCDLaunchCommands?: string[];
  /**
   * OpenOCD command(s) before configuration files are loaded (-c options)
   */
  openOCDPreConfigLaunchCommands?: string[];
  /**
   * OpenOCD/PE GDB Server configuration file(s) to use when debugging (OpenOCD -f option)
   */
  configFiles?: string[];
  /**
   * OpenOCD directories to search for config files and scripts (-s option). If no search directories are specified, it defaults to the configured cwd.
   */
  searchDir?: string[];
  /**
   * For st-util only. Set this to true if your debug probe is a ST-Link V1 (for example, the ST-Link on the STM32 VL Discovery is a V1 device). When set to false a ST-Link V2 device is used.
   */
  v1?: boolean;
  /**
   * Path to the ST-LINK_gdbserver executable. If not set then ST-LINK_gdbserver (ST-LINK_gdbserver.exe on Windows) must be on the system path.
   */
  stlinkPath?: string;
  /**
   * This path is normally resolved to the installed STM32CubeIDE or STM32CubeProgrammer but can be overridden here.
   */
  stm32cubeprogrammer?: string;
  /**
   * On BMP this is the ID number that should be passed to the attach command (defaults to 1); for PyOCD this is the target identifier (only needed for custom hardware)
   */
  targetId?: string | number;
  /**
   * PyOCD Board Identifier. Needed if multiple compatible boards are connected.
   */
  boardId?: string;
  /**
   * Path to a CMSIS-Pack file. Use to add extra device support.
   */
  cmsisPack?: string;
  /**
   * The serial port for the Black Magic Probe GDB Server. On Windows this will be "COM<num>", on Linux this will be something similar to /dev/ttyACM0, on OS X something like /dev/cu.usbmodemE2C0C4C6 (do not use tty versions on OS X)
   */
  BMPGDBSerialPort?: string;
  /**
   * Power up the board over Black Magic Probe. "powerOverBMP" : "enable" or "powerOverBMP" : "disable". If not set it will use the last power state.
   */
  powerOverBMP?: string;
  [k: string]: unknown;
}
