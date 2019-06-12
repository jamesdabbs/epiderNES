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

let uploadRom:
  (React.Ref.t(Js.Nullable.t(Dom.element)), Rawbones.Cpu.t => unit) => unit =
  (fileRef, onLoad) => {
    let doLoad:
      (React.Ref.t(Js.Nullable.t(Dom.element)), (string, string) => unit) =>
      unit = [%bs.raw
      {|
      function (fileRef, handler) {
        if (!fileRef.current) { return };

        var reader = new FileReader();

        reader.onload = function (event) {
          handler(fileRef.current.files[0].name, event.target.result);
        };

        reader.readAsBinaryString(fileRef.current.files[0]);
      }
    |}
    ];

    doLoad(fileRef, (filename, raw) =>
      cpu_of_string(filename, raw) |> onLoad
    );
  };

let loadRom: (string, Rawbones.Cpu.t => unit) => unit =
  (path, onLoad) => {
    let doLoad: (string, (string, string) => unit) => unit = [%bs.raw
      {|
        function (path, handler) {
          var request = new XMLHttpRequest();

          request.open('GET', 'public/roms/' + path, true);
          request.responseType = 'arraybuffer';

          request.onload = function() {
            if (request.status >= 200 && request.status < 400) {
              const bytes = new Uint8Array(request.response);
              const raw = String.fromCharCode.apply(null, bytes);

              handler(path, raw);
            } else {
              alert('Failed to load ' + path);
            }
          };

          request.send();
        }
      |}
    ];

    doLoad(path, (filename, raw) => cpu_of_string(filename, raw) |> onLoad);
  };

let drawTiles:
  (React.Ref.t(Js.Nullable.t(Dom.element)), Rawbones.Pattern.Table.t) => unit = [%bs.raw
  {|
    function (ref, table) {
      const ctx = ref.current.getContext('2d');

      for (let n = 0; n < table.length; n ++) {
        const tile = table[n];
        const img  = ctx.createImageData(8, 8);

        for (let i = 0; i < 8; i ++) {
          for (let j = 0; j < 8; j ++) {
            const tileValue = tile[i][j];
            const offset = 4 * ((8 * i) + j);

            img.data[offset    ] = 0;
            img.data[offset + 1] = 0;
            img.data[offset + 2] = 0;
            img.data[offset + 3] = 255;

            if (tileValue == 3) {
              img.data[offset] = 255;
            } else if (tileValue == 2) {
              img.data[offset + 1] = 255;
            } else if (tileValue == 1) {
              img.data[offset + 2] = 255;
            }
          }
        }

        const x = (8 * n) % 128;
        const y = 8 * Math.floor((8 * n) / 128);

        ctx.putImageData(img, x, y);
      }
    }
  |}
];