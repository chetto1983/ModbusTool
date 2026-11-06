<script lang="ts">
  import { m } from "../../paraglide/messages.js";
  import { api, type LinkConfig, type NetworkKind, type SerialConfig, type SerialKind } from "../api";

  let {
    link = $bindable(),
    disabled = false,
    listening = false,
  }: { link: LinkConfig; disabled?: boolean; listening?: boolean } = $props();

  const KINDS: { id: LinkConfig["kind"]; label: () => string }[] = [
    { id: "tcp", label: () => "Modbus TCP" },
    { id: "udp", label: () => "Modbus UDP" },
    { id: "rtuOverTcp", label: () => "RTU over TCP" },
    { id: "rtu", label: m.link_rtu_serial },
    { id: "ascii", label: m.link_ascii_serial },
  ];
  const BAUD_RATES = [1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200, 230400];

  let ports = $state<string[]>([]);

  const isSerial = (kind: LinkConfig["kind"]): kind is SerialKind => kind === "rtu" || kind === "ascii";

  function defaultSerial(): SerialConfig {
    return { port: ports[0] ?? "", baudRate: 9600, dataBits: 8, parity: "none", stopBits: 1 };
  }

  function changeKind(kind: LinkConfig["kind"]) {
    if (isSerial(kind)) {
      const serial = "serial" in link ? link.serial : defaultSerial();
      link = { kind, serial: { ...serial, dataBits: kind === "ascii" ? 7 : serial.dataBits } };
    } else {
      const host = "host" in link ? link.host : listening ? "0.0.0.0" : "127.0.0.1";
      const port = "port" in link ? link.port : 502;
      link = { kind: kind as NetworkKind, host, port };
    }
  }

  async function refreshPorts() {
    ports = await api.serialPorts().catch(() => []);
    if ("serial" in link && !link.serial.port && ports.length) link.serial.port = ports[0];
  }

  $effect(() => {
    if (isSerial(link.kind)) refreshPorts();
  });
</script>

<div class="link">
  <label class="field">
    {m.link_protocol()}
    <select value={link.kind} {disabled} onchange={(e) => changeKind(e.currentTarget.value as LinkConfig["kind"])}>
      {#each KINDS as kind (kind.id)}
        <option value={kind.id}>{kind.label()}</option>
      {/each}
    </select>
  </label>

  {#if "host" in link}
    <div class="host">
      <label class="field">
        {listening ? m.link_bind_address() : m.link_host()}
        <input bind:value={link.host} {disabled} spellcheck="false" />
      </label>
      <label class="field">
        {m.link_port()}
        <input type="number" min="1" max="65535" bind:value={link.port} {disabled} />
      </label>
    </div>
  {:else}
    <label class="field">
      {m.link_serial_port()}
      <div class="row">
        <input
          list="serial-ports"
          bind:value={link.serial.port}
          {disabled}
          spellcheck="false"
          placeholder="COM1, /dev/ttyUSB0"
        />
        <button class="btn small ghost" type="button" onclick={refreshPorts} {disabled} title={m.link_rescan()}
          >↻</button
        >
      </div>
      <datalist id="serial-ports">
        {#each ports as port (port)}<option value={port}></option>{/each}
      </datalist>
    </label>
    <div class="grid-2">
      <label class="field">
        {m.link_baud()}
        <select bind:value={link.serial.baudRate} {disabled}>
          {#each BAUD_RATES as rate (rate)}<option value={rate}>{rate}</option>{/each}
        </select>
      </label>
      <label class="field">
        {m.link_parity()}
        <select bind:value={link.serial.parity} {disabled}>
          <option value="none">{m.link_parity_none()}</option>
          <option value="even">{m.link_parity_even()}</option>
          <option value="odd">{m.link_parity_odd()}</option>
        </select>
      </label>
      <label class="field">
        {m.link_data_bits()}
        <select bind:value={link.serial.dataBits} {disabled}>
          <option value={7}>7</option>
          <option value={8}>8</option>
        </select>
      </label>
      <label class="field">
        {m.link_stop_bits()}
        <select bind:value={link.serial.stopBits} {disabled}>
          <option value={1}>1</option>
          <option value={2}>2</option>
        </select>
      </label>
    </div>
  {/if}
</div>

<style>
  .link {
    display: grid;
    gap: 10px;
  }
  .host {
    display: grid;
    grid-template-columns: 1fr 92px;
    gap: 10px;
  }
</style>
