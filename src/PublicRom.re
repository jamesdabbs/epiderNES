[@react.component]
let make = (~name, ~path, ~onLoad, ~className) => {
  let loadRom = (filename, raw) => {
    Util.cpu_of_string(filename, raw) |> onLoad;
  };

  let handleLoad: (string, (string, string) => unit) => unit = [%bs.raw
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

  <a className onClick={_ => handleLoad(path, loadRom)}>
    {ReasonReact.string(name)}
  </a>;
};