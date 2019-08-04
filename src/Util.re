let nes_of_string = (filename, raw) =>
  Bytes.of_string(raw) |> Rawbones.Rom.parse(filename) |> Rawbones.Nes.load;

let uploadRom:
  (React.Ref.t(Js.Nullable.t(Dom.element)), Rawbones.Nes.t => unit) => unit =
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
      nes_of_string(filename, raw) |> onLoad
    );
  };

let string_of_array_buffer: Fetch.arrayBuffer => string = [%bs.raw
  {|
  function (arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer);
    return String.fromCharCode.apply(null, bytes);
  }
|}
];

let loadRom: (string, Rawbones.Nes.t => unit) => unit =
  (path, onLoad) =>
    ignore(
      Js.Promise.(
        Fetch.fetch("public/roms/" ++ path)
        |> then_(Fetch.Response.arrayBuffer)
        |> then_(buf =>
             string_of_array_buffer(buf)
             |> nes_of_string(path)
             |> onLoad
             |> resolve
           )
      ),
    );

let displayFrame:
  (React.Ref.t(Js.Nullable.t(Dom.element)), Rawbones.Render.frame) => unit = [%bs.raw
  {|
    function (ref, framebuffer) {
      const ctx = ref.current.getContext('2d', { alpha: false });
      const rgba_bytes = new Uint8ClampedArray(256 * 240 * 4);
      let rgba_offset = 0;
      for (let i = 0; i < framebuffer.length; i = i + 3) {
        rgba_bytes[rgba_offset + 0] = framebuffer[i + 0];
        rgba_bytes[rgba_offset + 1] = framebuffer[i + 1];
        rgba_bytes[rgba_offset + 2] = framebuffer[i + 2];
        rgba_bytes[rgba_offset + 3] = 255;
        rgba_offset = rgba_offset + 4;
      }
      const image = new ImageData(rgba_bytes, 256, 240);
      ctx.putImageData(image, 0, 0);
    }
  |}
];

let displayFrameScaled:
  (React.Ref.t(Js.Nullable.t(Dom.element)), Rawbones.Render.frame) => unit = [%bs.raw
  {|
    function (ref, framebuffer) {
      const ctx = ref.current.getContext('2d', { alpha: false });
      const rgba_bytes = new Uint8ClampedArray(512 * 480 * 4);
      let rgba_offset = 0;
      for (let i = 0; i < framebuffer.length; i = i + 3) {
        rgba_bytes[rgba_offset + 0] = framebuffer[i + 0];
        rgba_bytes[rgba_offset + 4] = framebuffer[i + 0];
        rgba_bytes[rgba_offset + 1] = framebuffer[i + 1];
        rgba_bytes[rgba_offset + 5] = framebuffer[i + 1];
        rgba_bytes[rgba_offset + 2] = framebuffer[i + 2];
        rgba_bytes[rgba_offset + 6] = framebuffer[i + 2];
        rgba_bytes[rgba_offset + 3] = 255;
        rgba_bytes[rgba_offset + 7] = 255;
        rgba_bytes[rgba_offset + 2048 + 0] = framebuffer[i + 0];
        rgba_bytes[rgba_offset + 2048 + 4] = framebuffer[i + 0];
        rgba_bytes[rgba_offset + 2048 + 1] = framebuffer[i + 1];
        rgba_bytes[rgba_offset + 2048 + 5] = framebuffer[i + 1];
        rgba_bytes[rgba_offset + 2048 + 2] = framebuffer[i + 2];
        rgba_bytes[rgba_offset + 2048 + 6] = framebuffer[i + 2];
        rgba_bytes[rgba_offset + 2048 + 3] = 255;
        rgba_bytes[rgba_offset + 2048 + 7] = 255;
        rgba_offset = rgba_offset + 8;
        if (i % 768 == 0) {
          rgba_offset = rgba_offset + 2048;
        }
      }
      const image = new ImageData(rgba_bytes, 512, 480);
      ctx.putImageData(image, 0, 0);
    }
  |}
];

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

let parseHex: string => Js.Nullable.t(int) = [%bs.raw
  {|
  function(str) {
    const parsed = parseInt(str, 16);
    return isNaN(parsed) ? null : parsed;
  }
|}
];

let displayHex: int => string = [%bs.raw
  {|
  function(value) {
    const base = value.toString(16).toUpperCase();
    return base.length == 1 ? "0" + base : base;
  }
|}
];

let setupDebugging: Rawbones.Nes.t => unit = [%bs.raw
  {|
  function(nes) { window.nes = nes; }
|}
];

[@bs.val]
external requestAnimationFrame: (unit => unit) => int =
  "requestAnimationFrame";
[@bs.val] external cancelAnimationFrame: int => unit = "cancelAnimationFrame";
[@bs.val] [@bs.scope "performance"] external now: unit => float = "now";