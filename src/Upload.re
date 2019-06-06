[@react.component]
let make = (~onLoad) => {
  let loadRom = (onLoad, filename, rom) => {
    let cpu =
      Bytes.of_string(rom)
      |> Rawbones.Rom.parse(filename)
      |> Rawbones.Memory.build
      |> Rawbones.Cpu.build;

    if (cpu.memory.rom.pathname == "nestest.nes") {
      cpu.pc = 0xc000;
    };

    onLoad(cpu);
  };

  let fileRef = React.useRef(Js.Nullable.null);

  let handleFileUpload: ((string, string) => unit) => unit = [%bs.raw
    {|
    function (handler) {
      var reader = new FileReader();

      reader.onload = function (event) {
        handler(fileRef.current.files[0].name, event.target.result);
      };

      reader.readAsBinaryString(fileRef.current.files[0]);
    }
  |}
  ];

  <input
    type_="file"
    ref={ReactDOMRe.Ref.domRef(fileRef)}
    onChange={_ => handleFileUpload(loadRom(onLoad))}
  />;
};