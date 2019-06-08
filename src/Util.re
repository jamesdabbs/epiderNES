let cpu_of_string = (filename, raw) => {
  let cpu =
    Bytes.of_string(raw)
    |> Rawbones.Rom.parse(filename)
    |> Rawbones.Memory.build
    |> Rawbones.Cpu.build;

  if (cpu.memory.rom.pathname == "nestest.nes") {
    cpu.pc = 0xc000;
  } else {
    Rawbones.Cpu.reset(cpu);
  };

  cpu;
};