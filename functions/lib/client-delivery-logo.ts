/**
 * CODE Rx SOCIETY — the brand mark used by the client delivery pipeline.
 *
 * The mark is embedded here as a PNG rather than read from disk at delivery
 * time: workerd has no image decoder and no filesystem, the Pages asset binding
 * is not guaranteed on every route, and a delivery must never depend on a
 * network round trip to carry its branding. 96×96 keeps the header and the page
 * watermark crisp in print while staying small enough to inline.
 *
 * Source: `public/CODE RX11.png` — the society's official mark, and the only
 * logo the platform uses — resized to 96×96 and re-encoded as 8-bit RGBA. The
 * header band, the page watermark and every stamped copy therefore carry the
 * same logo as the website, the portal and the letters themselves.
 */

import { decodePng, type DecodedImage } from './client-delivery';

// prettier-ignore
const BRAND_MARK_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAYAAADimHc4AAAABGdBTUEAALGPC/xhBQAAACBjSFJNAAB6JgAAgIQA' +
  'APoAAACA6AAAdTAAAOpgAAA6mAAAF3CculE8AAAABmJLR0QA/wD/AP+gvaeTAAAAB3RJTUUH6gkUEDMlCiki+gAA' +
  'RJFJREFUeNrtvXeUZXd15/v5nXjzvZVzVVdXh+qgDlJLrSwhRBQgAyYHgw0OWOP07Lccnj1+HifGaexnhjGDzZAG' +
  'GzBgjAmyJCSh1LlbnSp35XRzPPn83h+nWjBrWSCJ6Pfmt9btXtV9695z9ve392+H795HTExMCP73+qEt5Yd9Af9/' +
  'X/8bgB/y0n7YF/DtlpQSRVFImnE62jqIZ5NSSokQ4lnfDwin2qRUr1JvNQjD8Fnf/6OwxI/SGSClFDHTlL25blzp' +
  'ykx7G7/2of/Cy0YPqWteMZ7tyKQCKdOpbDyha6qe1JMCgSi1qqHjBlar1rBkKJu1YrWhlnz7Pe99d/jof/ua3Pmq' +
  'a2hLt4u1wiqO6wqEkD8qN/1DB0BKKWKGKTs7O/n0Zz4rY6Em/KF4ph5YQ6qpjeu6vjeVTI4pqjKUjqd6Y7qRTiZM' +
  'M2HEtZQZF0EQUrYbsmU7ruM4dtO16vVmYyMIghXHcSZDGV52W860V7UXr02MNcp+I3z5K14qNvN5bMcWgPxhasgP' +
  'BYCrpiWTTPGxz31aJrW4IgdjPZbjXBtLx19kasbRmGHuMHSjQ1NVHUCoAs3U0A2VtmSaeMwgm0jhej6leo2NUplG' +
  'swmhQEVBkQKEIJCB13Ksou3Y041m86lqsfpoOp44fcuuwxurhY3gzkM3iXrzh2eqfqAASClRVZWutnZ+9kvvl/v9' +
  'gZQfC4+oqnZvKpl8cSaV3qmixlqNFsVGhVK1jB/6oAkM06C3v5t42mSgvRvD1OhOtxOGIeV6nfmVNdaLBRr1JnbL' +
  'platE4/FiGsmnbl2sskM8Xgcy7ftlm3N1qq1+zWh/pPhcupPH/h44/Kff0nUfghnxg8EACklilDIZbPs/uAb5Dsz' +
  'd3SoceOlubbc23OZ7K2aVDPFUomVzTU2i3kUU8PQDXLJNOlkimwmQ9yMYcQNpBBoqoJhanR05AjDgEKhitV0kAHI' +
  'MMTzPCzbotFs0rRbbJQKBL6P9EKGBgbpaeskm83i+G61UC4+Xq/XP9mdbvvqhx/+h9JTf/x50Wg2hJTyB2Kavu8A' +
  'SCmFpmryHX/ya/KO/dfnLOG9OpGMvyeXyt4og8C4Mr9ApV5ls1gg19ZGNpWmu6OLZDxOEARUm3Vark0oJIqmEAKa' +
  'oRGPxWhrT+MGPuVCFcdyCIMQ3/MJ/ICY0MjEUmRSGVRNpWm1WMtvUGpUcD2PuGYy2jtEX28vUhNutVl7olwq/7f2' +
  'RObLj144Wf/Ub/4X0Wq1hBBC/rsEQEopNE2TO3fulL//F39qLNibL0qnU7/c3dH1IqtpGXMrC8xduYKCoLe7m8He' +
  'fnRdp1ytsFkuYvsu8WQcMx5DURUk4Pk+iqKQSCXwgwD8EAWBE3hIL0Ai8YMA3/URgAxCQj+AQJJMJOlp7ySdTGE5' +
  'DrPzV7ADB9d22TE0yvZt2/A1aa2sr/1ro1D90yMdu5785V/9xWBqaur7apa+LwBIKUUykZDDIyPyV/7q97ZbnvPL' +
  'nW3tb1elyE3NzjC7OE8ynaIn28FAbx+FUpHVzXUsz0FVVaQCAZJEIoEZj5HOpNB1nVqtTixm0jfQR7lSZn/vTrrS' +
  '7Xzl7CPIQGIYOgGSaqmC3bBwXAffD9AVBVVRCYMAIQXtmRxDfQPoms7C6jIzS1fIpTIMdPexa9dOqlZjs1QtfSiG' +
  '8YFThcn1T73vT4Trut8XbVDvu+++7y0AEjE+Pi4/+oVPa7tfdN29qHywq73jNSsLy7HjZ06zsrrK6NAwI30DWJbF' +
  'pelJVoubOJ6LbTt4vo+ZiJPMpMjlMqSyKeKmSX+uhwMju9mol+jobqPVaPHy6+5gYXWZ+eIKh7btYWfvCJvlAp4M' +
  'EKqCoiggQDcNWpZNvVzHcz1atsXqxjqVaoWBnl52jmynUq2wuLHC8uIS/V09yd7e3ltLtcr1ORJz2U116faX3ymL' +
  'xeL3fLN+zwDYilDF+FvHw3S2PzOVX/jVZCrxR2k9vu3UqdNMXJkmmUhw7TUHcF2XC5cvsVEsYNuRGZBAMpvCTMaJ' +
  'JeIYhk4ykWCgrZub9x7m9utuIJ8vslBcJZvL4lYtju49zNeefBgtZZBQTF528+3s2bYTp2mTLxcJkMTjcUzTwLIs' +
  'pADd0Gk2mrRakYas5dcplcvs2r6Dgd4+VvPrzK8t41qOGN+5c5snwpc9XZ61Hjv+1IW33fsG77777lO+XTT+fNf3' +
  'xARdFf497//p8A1HX94TGMof5VLpdxTW89qx4yeRSEaHhkjE45y/eIlGs0kQSnzfR4+bmHGTRDrJ0LYhXNclCALS' +
  'RoLbrz/KofG9LCwu89CxJ5jdWGJ4bJjOXBup0OTAjnE+9pXPMTQ2xOKVJVQHbj54HTdeey2FaokHHv8GG40yfhCw' +
  'uZHHc1zCMMRu2bi2g297yDAkHo+hKILB3n72ju9mZmGexc1VcpksN157BDWmW+Va7b+1menf/71P/2Vp4i+/pnyv' +
  'vKTvWgOuCv+Pjn0kfPWhFw+FCfFXfd3dbymVyupTp08S0w32jO2kWCxy+tw5bMuh1bTwg4BYMkYimySWShBPJ2jL' +
  'ZbFthzAM6UrleNHtN9FyLT7/pX+h5lu093WgmTqB5bFvdBdTczOs1gvEEjEybRls12Vu9gq5XJrxPTuoVxucvngB' +
  'PwyJxUxUVYk0Ih5D0RQM0yAIAmr1Or4fYDsOKyurjI2M0t/RQ6FRomRXGekb0AcGeo/Wwubwa47c/cTfXf5i/SXb' +
  'bvyeaMJ3pQFXhf8bj/51eH1ufDjXk/vrnvbOV5+ducypU2dJBiZ9bV2cOHWKjXwez/PxvYBUWxrd1FENnXg6QbYt' +
  'R09vN4amUSlXUVSFermGdHxuPXqU3Tt2sraxydnpS7haSJuW4EXX38Tnv/ZV1I44mqoStjz2DO9gx8gw6/l1vvH4' +
  'MZY21om3pxBSoCCIJ2I4nkuz0cKzXQxFQ1UUrIZFtVyl3qyTiifQFJXt20fZvWcXK/UNfDPgRTfeTE+2Wy5urHzG' +
  'qti/dP/6sbX/+qJfV4Dv6mD+rjRACCHG73tReGvvdX0yof4/Y8Oj95YaFc5cuEAqMMmYCR79xmPUW01c2yMIQwzT' +
  'INORJd2WQdNVOro6UHWNeDxOs9Wio72dTDZD70AvVuhycXKSyYkpDFWnK9vBxPQ0g129JOIJjl84R7ojQ71UZ6xr' +
  'kJhu8JV/fYDHTpzAUQNy3R2053LEDBNN0wCJYZoELZfD43u55Zaj9I/10d7TxrbhETLxNKtr61sOgU2xWGLvjt2E' +
  'QlIOqoz09Ym2THbf3NrScFsp8cg7/ut9jZ9/2buU70YLXrAGSCnFnj17wv/wx7/ZYRnhX+0e2/HWsl3hyuIibXoG' +
  '2XR58MGv43k+zVaLbFcb2fYcVtMiCANSuRQdPV2kMylalk0gJel0ip3bRmk0G8R0E6EorBY3MRWN/Fqe9aU10AQv' +
  'vf1OHMvh0sosqc4cTqNFaWGTlmvT3tNBKpsmlCFI0FSNcqVCEAQEfkBcMbjlxus5eGg/+/t3stna5PLqDF959OsE' +
  'FZ9MmOTBhx9BhpJsJkMiFeflL38pFRoE8YDxke2YQVw+9dSpD/sV+//4xB9/oH758mXlhbqoL0gDpJRifHxcNnVi' +
  '88XV3905MvqelbVVcfrC0+T0FJoHX3/0UTzXo1ato2o6ZjJGLBWjs6cTRVUJwhCJxDQNNE1DAQxNo96sA6ApKjII' +
  'iZsxalaTzu4OMp1ZpAIzE9Msrq2Q7esgk0kiFAXV1El3ZBkZHcayLFotiyAIUYWg2WpFQZnjcWjfXlIDaV685xZ0' +
  'VeWRqaeYX1uhUCxx/PGTZNMZOrNtzC8u4Tkuuq4zv7jA3tHdLK+usVRcJ6UlRCaWPjC7MO++7fVvfvLH731tWCgU' +
  'xAvRhOddEZNSkk1nJMD5pcm3d3d2/eza2rry5MkTdMZymKHGgw88jN1yqJSrGMkYZtKM8kFSIBRBKpsk15HDsRzK' +
  'pQphEOI4DtVajWq9RqVRp1Kv0XQiVzEZj7NRKBCPJ+jp60FvT5Lt60AoAqvaIi1ijPYM0ZNop7CySa1Wx/d9QKJq' +
  'Kpqu4fs+2/uHiPXE2dE7hDACPnvmyzxx4RQPPfgoJx44STNf5+yFp+nq7SRhxghkSKFQolW3+OpX7md7+xBuweGx' +
  'U8fwbFfv6+n51a9fOvF6kRYyHo/LrYLQ9xcAIYQYfd0t8sd+/iduaG9v/7901MQjj36D9kSa3mwn33j0MRzHoVKq' +
  'oqgqhmmgaCp2y8axbDzXRREKqiLIZjNYTYtGvU48HiOVTJCOp/DtyAY3mk0azSZWq0UmlaTSqOL4LnrcRKoCr2Zx' +
  'w64DvPu1b+KVd9+NGTNIeQaxQKWnqxNFKFQqVeKJGG2JNLv27iAWN7l25z6emDnJ6anzrC6usXFlncpqEekHNCo1' +
  'QkWSTifJtGcRiqC0WaRVb/HwQ48y1jWMVWrxyLHH6evsyeQy2d+95RWvvGbbvm0SeN4q8LwA2DI94T0Hbu+wXed3' +
  'Brp7R04+fQZNKOwYGOHhhx/BdqNoNpVKYhoGpmkSj8UwYybVSp1qqYZt2biOC0hSqSTNRpNioUilUqNaqRJ4PsVi' +
  'CcuyqFSqtFotPN/Dblm0Wk2clk2jUictYli+TcyMcWHiMk8eP8Zjjz9OVyLL6uIqlUqFZqNJvVjjun0HaKgt7jxw' +
  'A6VmiccvnKawWWRzeZNavoIMAzoGOjENk5hhoBka7R1txOIxvDCgUq1RKZc5e/osO/u3Ua83OH76JPt27t6NKn77' +
  'Za96XXZ8fDyU8vkV255zTVhKSU9Xt5RSilvfcM9P7t2/92UXLl6iUqty83VHmLg0STlfpmXZxNJxEODbHqXNIrpp' +
  '0DPQQ7PZorRRxHc90m1pAtWPPKBEDE3XSaVTIKFUKBFLxKhUqghFEGLiE9CsN0imE+i6ighD1FDh/i8/wOkTZ5iZ' +
  'nePKpRkUVSEUIa16E2Go+H7Aru4RYp1xBrt7Gejq5rOPf5WltVVKGyXKa0WcukWmK4eRMMlms2hSoVlvsVkoEfgB' +
  'KGDbNvUKzDRn6OroZHvfMIubK8wvLbBr544fO3vq3NeFEB9cXlqSjWbz+6IBov26UfnKd7/pcHdvz33SD9XZ+SsM' +
  'd/XhWjbTs7O4jotAEI/F0Q0d3TQwYyaGobO2tIaiKrR1teN5PlbLxnU9XM/DsV3slk2lWKZaqWLGYzi2gx962LZN' +
  'q2Vjtywcy6aUL1FcL9CsNEiYcVqVBl/6+y9y8bEzuK5D/1g/rufguC6e56MHggPX7MURDrfuvY7Ly7Ocm7lMNV+h' +
  'tFKima+joNDW3Y7vetxw5DCTl2aQQhCPxzFMg2QqSTqVolquEfgBJ0+coqe9E9WDy5MT5FIZvbOn6xeP3PPi8cGh' +
  'Ifl8tOA5ASClZHx8XP70699llmqV9/X39Ayfu3geBRgZGuTYkycIpSRAosV0ivkilUo1KqzETHRDJx6PUS9VsVsW' +
  'yXQCz/WoVqrYTQur3qJRqVOr1Gk1WxQ284RhiOd4eI6L3bKwLRvHdXFsB7veYrRzkPFdu9izexyv5ZBMJxkaHWTn' +
  'yHYmLs8ggdAPOLL3INv6hznYvZeN9SInT5+nsFKktF6iul7Ba7pkunNIJAOD/Wi+wpXFRSzLwnOilLjne9QbDdKZ' +
  'NM2Wheu5nDxxij1jO2naFhPzM+zeuXO3L4Of/61f+y19fHz8OR/Iz1UDhMgKeWbq4s0Dg/2vyxc2WV1fZf+ePcxM' +
  'z1BvNqhXm9GOtl0Ge/vZPbqD0PYpF0oU8yV810MIgd20qRYrCEBTVTzXxXVdPNfFdzxatSaqquL6Hq4baYdj2dgt' +
  'B9/zcW2X0c4hdo2OoRoaD/zrA5gJg8M3Hqa7vYvzpy9QrtWQSLb3DPGO17yJa3cc5CWH72AkN8rRoevYl9yBVgGn' +
  '2kJRFZIdKYLQZ+/O3Tz24BN4MkBKieu6OLUWGTPFG17/Wt787jcRj8Wo1xpsrK7h2i7bBoeZmp7Gtm0GBvre/E+n' +
  'Hz4qTPGcD+TveAZc3f1vvPcdsSuVtfd0dXS2PXXyON1dneSyGZ56/Bie46EhGBoZ5prrD3Do6EH6+npZubLMySdO' +
  'c+HCRQqlEghBUtMQKASOj6IpKIqKY1vYLRtV00gmE7iKgy4lnuvhuR6qpgJgtVoMd/YxMjjEwPAAH/v4J1mdX2bs' +
  'mp0oqsLkzBxmKk7M1DCkxmvvfAXt2TYyySSe59FstDCFycGxAwT1AGoBpbCK53vs3bOb/Ow6c1cWMFJxNE0jm8lQ' +
  'K1TYtW2MfXdew5kLT+P6Lo7tkk6nOHvmLLfccSuLK0tcmLzEdQcPdc5dmX/3z/70LxwfHx/3JicnvycaIIQQcnJt' +
  '/khPf8/LNjY2KJXK7B7byaXzl3A9l0QswdHbb6RrRx8bXoWTs+c5MXeORsrhwEsO84offyUjAwNRXZZIsO6WQKxa' +
  'C01XUVQVz/NoWVaUs2+0cB0Xz/OinW85JKROWzrD4OgAj514ilOPHyeeMBkdHia/WSDVmSXTnSOWMLl+/CCH9x3E' +
  '0HVMw6BYqVCpVNgo5FlaWaHRbHLT9TcxPrwLU9UZ7Rni+LHTxNNJDN0gnU7Talo4nofeZnLq5Gkmj19GIkhseW5N' +
  'q8X6yir9Xb2srK/SaDTYtm3k1Q+dfeKwEOI5nQXfUQPGd+2WX/jkF9T/+PE/e2tXV0fHiZMnySRTGLrB/MICruPS' +
  '9FrkVzdw8TEyMRrlKpXNShTF5qvMnpmkWqyixHRCGdKqNZGhJNOWxQ98fNvF1A0S8RiaoqJJDelu2VBVR5EKdqNF' +
  'V38vCTPO6to6X/viV/Edj4HtgwRhyEahSDyXwrVdets6ufclr4h2cSpFtdGgXKlQLJdYW19ndW2NVqvFQP8A6VyG' +
  'fam9PH3sHHXbQtVUgpaDDEIa9Qa7du+gf9cQD33uAaqFCsl0KtoUUhK4PhMXJ7jlzltZWF1i5soVrtmzr2tmYuaN' +
  'UsoTjVpNrqytvXAApJQIVZFHXnLnWEdP5yuazQbVWo0jhw4zNzuH7wc4truVSlCwGi3y+Tzb945hegoz01MoLti2' +
  'gzBVTMOgJ9tJe3+OkcEherq6SafTxEwTQzcir8MwMHQdTddQFRVN05ianeLLj/0ritAw4wm+9s/3U1raxEiatHW3' +
  'Y2oxunKd1AMLAsnLbnkxQ/1DpJNJAEqVCtValbXNTVZX1ynkN2nv6IiSgzEdU9U5deJpzEycwPUZHB5g93XjTD89' +
  'ycj4KGe+cZpauUYslUCKiBTQqDXwLRchoFwqMdjdx+ziAnt27qS7t/vVB++69QNPf/3xucuXL3/bFMW3BeDqL1Yb' +
  'tRfvOLBzZHFxiXQmRTab5tSxk3iuTyBDNCHQDR3phyRSSXq29zM0OsjSyjJe3UbVVNrNBG953Rvp6uhkY2ODYrHI' +
  '7OwczUYjqg3EY6RTadKZDLlsjmwuSyqRoFyt8MjxR6k2a+zbs58TT55gcWoOwgBD16hVqmzvHOGPfut3+cyXvsBm' +
  'Oc8dR29BVVXSyST5UolKtcJ6Ps/q6hpr66sEYUgykSRf2GTXNdv5h098GttxkA1IxGOMHtxOvlygc3sfV6avsDgx' +
  'jx7TcVo2iVSSRq2JEAqO4yAlzE7Ncvj6a1nJb7CwvMTAQP/Y8StLdwFz3yk/9G0B2L17N697+9visxsLL9c0VeSL' +
  'Bbq7OikUirQsO/KzDYMwCCiVSpQKJRKpFDNPTjB3cpriWoFGo0mowE03H+Etr38D9z/4AI88+ggra6s4jouuacQT' +
  'CTKZLB3t7Tiux1Yik1KpxOPHHmNmfo7evj7OnTnH1PkJ7EYTTdPQpEJSxBkZGmZsdDu7to1x/YHDJOMJsqkUrueR' +
  'LxbZyOdZXllldXWVSqVMT08f5UqF9oEsExOTTEzPEE/ECIOQofERrkxdYebEJPFsAtdyAQgdCDyfWqUGEiQSFEGr' +
  'ZUX1CD8gm0ixsrLK6E0jSjKduueeH3vdJ3bv3u18u8P4WQHYKrbIsRsOj/VvG7i+Uirj2g593T1cvniZwA8IQ0km' +
  'l6HVbLG4tIJm6jQ8i/ri0hY1RKCqKoEXYtk265sbHD50mBuOHKFcKrO8vMTS8jL5YpFWq4XjOPiuQ6GwSb0WFUgc' +
  'y2KgvZdsPINpmgzf8SIy2Qis9vY2YrE4iqLykU98jKbV4qbrjxIzTZLxOIurq88cuotLS6yuryKEgud5eMIl2z7I' +
  'Z//+H9HjJqqmks6kaDRbLF28gtBUPCdAqCqB54Prg4juZ2hogP179vLYk0+yub5JOplicX6RjlyO2eVF6o06HZ3t' +
  '1z89cXm7EOLStzND3/EQDgL/aEdnW+/y8gqapqMbeuTX+z5+GOCHAUbMIPADTMOgq6uLfdfsIR6Ps7S4xOZGnlK5' +
  'TLFUpFguUyyW6OnuYmRwkEMHDpDLZkFK6o0GjWYT27bxfA/X8/G8yFuyHYdGo0GtXqdULrGxuUmhWGR1Y4NCIU+z' +
  '1SIRj/OOt74VXdfobGuj1qizsr7G0soKCwuLrKws06g3aG/vYHV9letuP8RT3zjOxmYB1dAJpSTVlmFjdoVYPA5C' +
  'gArxVILyehEJ6DGdtq42fuLdb6WjrY1Hn3w8ihc8h/W1NW7YfpTl/Dqr6+t0dnX0zU7O3gBcekEmaMf27XzxY59T' +
  'f+WD/+mWZDIpCsUiuVyGcqlM4PkEQYCmqUg/YHh4kGQ2Re9YP6P7tjG2c5RkLMFmocD83BLzk/MsnZ+nVqshBDRa' +
  'LcqVKrqmo6oquq7j+D6262K7LmcvnefspfMICft27cWybTY382xsbJDPb1Iql7Asm87ODizbxrZtxnftJh5PoGs6' +
  'tuNwZXGR+cVFZmZmKZaK6IbGwOAApmHQ3pOlu70LJVS57bZbUDUN1VDR4waqprBz504un7nMI499g8DzkUA8FsOI' +
  'm9x43REuXZ7gxFMncRwHI2Zg2Q6qohL4IYaqs76+wVDPoGKY5k3Slx8rV4pys1B4fgDopimvf/Gdbalk6pDneqBD' +
  'R1c7+fU8IRJN0/CCkHQ2RXtPO0JXaLUaLM0t0rKbaIrG6vw68zMLFNby1NcrzMzOsGv3bizLotlq0mzFMRsx4rEY' +
  'vu8ThiFBEHDq8ln+4YHPEVdjdHV0YuoxfM9HyvCb16draKq2FVO4dPf1UCiVaM+1cb5cYnV9nemZWWbnZlEMhZX8' +
  'SkT0BQLf5/SFM8+kTyzPJhASoStoSZ3cUDtzC1dwrIgodvToEQ4dvgbHd7gyv8DqxVWuv/E6Hnn4sa3MrgcpQSG/' +
  'STaRplyuEBKSyWUO7b7hcG7q9NnSs1Uev60J2shvDo/sGB2uVqogBalUiisTc3iOh2U5CE2lUapRKpWIJeKEboBi' +
  'K9CQrKyvUSlXsepN3LqFqiice/ocBw4coFFvUGs0UJQoEg7SaaSUWI5Ny7ZwfRehRvXucqWCoZjUG3Usy8J1HTzP' +
  'x9B1PM+j3qjjBC5WaJMvFFBVlUajwdLSMhOTE9SaNSp2lYXFBZLpFLquUa/W0HUd04yRyqUxYiYtq4Vn+Qhd0CjU' +
  'WZxbRFNVrj1yiHgyxqf+52dob29jYKCPzu5OgoSC23IRPgR+iJSSjbVNRse2o2oKLdsi25Yd3VhaGwJKz8sEXU0k' +
  'CVXZmWvL5fKFPH7TIfAD6vUmnuuDlChS0tHehiE11BDwQ3zHxakrxFWDsuvhNqzoQw2Vs08/zctLeYSqUqvXcV0X' +
  'KSM+Z71R56Nf+nsqVpWF5UVCL6DpuPzzV78EPmQSKXp6emm2WnieSzIRp96o02g28EOPtY1V8t4mCwuLVKsVVlZW' +
  'KBYLZDpyFPKbxGMmhqoiEMRiMax6ExFInJiOoUgMTUfxA9KxFKtzy7SaTYZ2DFMoFrh8/jKpVJLu3i4O3XKYy+cv' +
  's3BlEc910VQVaRi4rketXMOMGXi+T6lUJplMtimqOgacezYKy78JgKIoV4EYS6aS6vLaMrqp49gOrhPxdqQEVVHx' +
  'ZUilXiNr5oibOolsCtMwaDSj5JwaNxBI1FBSr1b4+kMP8fJ77yG/kicVT+JuHbSVepUnzj5FzWkQOj6B5eNbHvOb' +
  '80jLo7ezj0w2S6vVAsAPAsrlMoEMsS2H+SsLKFKhXqxh2xaO4yB0BcVvYNk2qWQK3wsQaggIjHiMMJTYTSsiiJkG' +
  'juvSo3SxNL0IoSSwPWwv5PD1hxjaPsjT5y7w1ImTCMen4doEnkez3ohq0orAFQqBDFEVlWq5Sve2Tk0SjgE8Ly8o' +
  'mUggpRQj114zoikaLatFLBHDtmxCP4hIrroKqsCyLTpyKQIZYLs2SZkilkwghIIZM4lpcXxCQj8kaHk8+vCj7Ni3' +
  'C1OP0dhsoGsG9UYDhGT/0B5ajsXa2ipzG7MogWC0bwQhBaYRo9lo4roupmmyvrFOw2kiVEGr0eTK5BzD46O4ioev' +
  'hWgxE83QqNaq6KYJqoLTbBGEAQoCFAWhKlHCz/Mp5ctopo4aCoobRaQf0jfUR9+Oflamllh9chXph9SadeK6ieU6' +
  'hIFEhhJkiO97hBjUajUMVcNybOKxOKqqbZNSiqXFRVqW9dwAGBgc5J0/+VOGaZp9hBKrZdHWlcOybMIgsnexuEk8' +
  'GUdKSbNex3dNpBsQeAH1SpVcOotUeynXqljVGr7tEXgBAfCVL36F2156J9ViFdyQTCpDKpXmmrF9BEHIWUcwfX4C' +
  'TdUZ6I1yPY1Gg0azgQRatQott4WiK/iWR3tnJ0IRbCysYWbjmG0JvMDDbTm0ai1UQ8MLfFAUlK32KEVTQRFROtxy' +
  'CaUklohTrdYQQiGby1EulGk6LdSAaAM5HiKm4TkuBGEkfABBdG+eT7VWQ9M1XM9HUVRisVj/W972dv1Tn/zEv5kd' +
  'fdZD+NLMlG6aRlZRVWzbxQ8krtNChhJF0wgcH9ttkUgnCBGgq+imSTKZIpPLIBTB2vwGruPhNW3segvfCYmlE2yU' +
  'Cjzw5fsZ2bkNz/ZZX1/HNGMYhoGmqpSLZQxhoAqVUqlIEIZ4vocf+HhhQKiEqEkdp+WgmQaJXJpAhrQqDVqFMlJA' +
  '4HrEEiaqriElBG6ADGVUqEEiwxDpR900EolQBGbMoLheRDV0hKJQLpTRqkpEfTcNXNtBjxm06i2S6RS+F3lVyVwK' +
  'u2kT+iGtloWiKbQqLaSUGKbRcXFm0gS852yChBBy/003GEYynlKEguO6SE1gN2yEEOiaSluuDUVRqDfreMWAWr5M' +
  'QSjEEnGynW2kMmnsciuqCWs6RipGpiuFoqrUKzUq9TqVE2fJdGQxY3EUD0QIQij4vk//4AASSdO1CEQIApS4iqop' +
  'IAI0XSfb34G5VXHzfZ9kTxoZSHzXx6lZ+L6HHkh8x0P6AaoWMTSEKhBAGIbEwqgTJ5QhXsPBszxSXVHUHfoBMgjR' +
  'DR1V04hLSavRRDEi37+rvxenZVOtVQm9gFDRcGwHMxmn1bBQVQXTjGUazbIphKj/W67os2qAbdtmKpuNq5qGHtNR' +
  'dRXf8xGKwq4du/FFSKVUpi3bFglHUwn8ABmG1PJVGoU6qq6RyeQidkQqjqZrBEEAsSSmokUVMsfB9xpoSuTXK6qK' +
  'ElOJxZOgShRdRTWj71djGmbKJJlJkMllaetsI5NMU97K9duWg9NwsGoWbtqJSpq2S+B40bmlKAReEMUUQUjou6iK' +
  'hqHrCARSRrs5Hk+g6iqhLgl8H3Wrz0AiSSfTpBIp7KZF4Pq0dbSjqxprzZVnWqRMRSABVdUwdD1u27bxbHJ+VgBc' +
  '19N0TdPjsRgCEX2476NqUeEkCAJ+8efui1gIYYimaaiqihAiOvGFQFUVVEVBIKKGiS1PQAiBoijR+xXxzeKdECiK' +
  'QFEVhBKRuBRFRdEUVFVB0zRiMZOYGZkW3dQxFA3bcbEtG9u1cWw3ssdb7UlBEEQtRhJCKQnDkDCM/kZGLncow8gk' +
  'AWEgCYMtcyUlQRh9RhCEBGEQnYFh9O+KEFiWxUc/9jGEiOTghwHoAlVTMHQDTVVVx/O05w2A73lSCCFjRkTrRokO' +
  'G8eyWd9Y57WvuZdCvcwjJx6PGh+2AFA0NXq/KlC0iJilaxqKoqCpUeVLUVVUTY3AUbbA0DQUVYmYbOqW0DUVVdW2' +
  '/i0CQNVV4qZBIpZAi2kgwfN8HNulZdlRf4EX4PsegR/gBQG+5xEGUT+C7wfPRNwyCAmD4BneqAwjrybwo599P0q5' +
  'BF70e54XfSaBJJAhSMlt197EzTfexGf+8bOEYRBZA1WgqGq0URSVF1QPUFXVR0rP1A3UqwLTVIYHhrnnnnsYHBnm' +
  '41/4e9Y211H1SPiqqiI0gWmY9HR009/VQzqdxnEc8pUiFasOhoKiRi9V0bbA2AJA1yKtuQqCchUE5Rn+aEpPMNTZ' +
  'S7lcYdMvoppaRHt3/SiB50ZdkkEQREKzXOKaQej7BEGIlCFSCpAh9UaTar1GsKUN0e6OwLnabRlugRN63wLW1vuu' +
  'kgR+/GWvIZNJ8+BDD2HpPgIFXdeJrAe+aRj+8wZA11TX9/yWaUQACCkwNIP3vuOnKLfqfOTTH2dseJTr9x7ia489' +
  'FF0Ukt2DY/zEa9/MrUeOkkqmnukwbLSaPHn2BH/35U/Tcu2o81GTqEikohKGoHiSIFDQQonUIhdP9SMwHOkSFC3e' +
  '87Y3cHjvNXzt2MM8fWKSRDrxzV29tXMjcxH9XF8rc+udd3LkhgOEYUDgR4GYrqlYls2lySnuf/hRNstlwkBumZno' +
  'FWlIiAwkbGmHlBKkREPhVXe9grX8Bp/8wqd59Utewbt+4l18+B8/iu97GLpG3Ijhuq6jqZr3bHL+N4vy0dCMmOM4' +
  'Ts3QDeRWxKhqGq7rMjU7zfrqGqP9I+zbtQdFKPi+x6Ed+/jT3/hPvO7lr+LSxCS/8bv/kffc9z5++/f/E/MLC9x5' +
  '9FYyamLLJFzdXX6UXXX9LVXfSkNvBUiu6+K4Lq7nsVra5MriAsZWEq5ebVCvNWk1LaymjdVysCwH24mYC47r0nBa' +
  'nLtwHtVUsX2XD//tJ/ijP/wL/uaD/4ONcoEbbr2W19/7SlSh4vledD1+ZOvDIED6YQREGG6dFREQQgr2797HcO8g' +
  'q2urTMxNYzs2QkDoBRi6jq5rOI5TNXTNfrYC/bNqwNHrjrjHzp0pCED40Kg3yGYzFEolcpkcUko+96UvoGkaTb9F' +
  'V3snv/RT72Ns2yj/8PnP8X//5z+i3IqCEp6Gx08f4xfe83M4lh35z0IgQ0nC1NHCCFhfeGgxA6mGhGoQvScI0YWK' +
  'aZiYMZOWZ+PJyLxYLRupRPclgxA1FEgp8QIfn5AgCNF0DcVQqXsNys0K5y9NsFko4p85T8Nq8NO/+m46htvJZlJU' +
  'yhVURdna9SFsHeRhKJEyOsiRkWfk+g5//sG/isqSAnLpLMVSEUURBIFPMp5ACEGz2cpfM77XeV4m6MqVK3zkbz7k' +
  'bTuwb8W2bdqyWdaqm4h2wer6GmM7dyAlNOwmQlEIFbjl2qPs3T3O/NISf/uJj9EIbTLdbZGtV1UqdpM//eBfoaYM' +
  '1LRJZ6qN19zxMq7ddxBD0ynXKjz19Cm+cfEknuciFAVDqNy48yA3H76e9mwbq+trdGQ7sB0Pz4lIYKgK7XqKu6+7' +
  'hb2ju1A1ldXNdf7lsQeZXL1C6Ac4oUfZqlJ16iTSCTp0Bc9xafkOlVYNz/fxbIew6XD3K19E/3A/gQxYm1/jn79w' +
  'P9u2D3LbS28hlIKnnzjH8adOI5FUWjXCMERFobejmytzcyRSSUqFIj29XRGftFZb+ewn/6e7+Ad/+G9qwL9pglw3' +
  'qoM2m825ar1Gd0/3Vt0zZD2/QVuuDUM3tnaGRISwe/tOXNdjcnqKpc1VjIQJMlLXUEqMuImtB7jCpyvdxq++8+f5' +
  'sbvv4fy583zsE58kcAJ+9s3v5s0vejWh7eM2LV5y4Fbue+t76Ei28dUvf43SRomh/gEsx8Z2XaxWizQm9732Xdx1' +
  '3a089ODDfOHzX2Ssf5RffNN72d4+gGs7EX+nUqTSqiNEtItTiTjjB8cp23UmLs+yPL9CvdbgkQcfw4m5dO7qItOf' +
  'QYY+ZtKga0cXM9PTnHj8ZOTaBtHBLSSYukE2l2WzuIkeN3FbLgktQalUxnGcOQDLtp+7BlxNR3uuO1Msluyuts5Y' +
  'o1InlU1T9isICe3ZHEvrKxFNQ1HRVY1KtUK+UMAPA6QU0QEMiEAgEei6jpCCl9xwB/t37+Gr/3o/v/dnf0zLd3h6' +
  '4iJ/8Qfv55Zrj/Lgk49SqVW584ZbKJbLvP+v/wsPP/koyUQSVMEdt9yG67i4TYujtx5ibGSUz3zh83zgY/+dQIYk' +
  'kkne+ea3cdP+I5y+dI56s06hXEYTKjfefQOu65POJInlYpw9doEnv/AEtUodIxlnZXGDf/rvX+Sut99NrC3G3a97' +
  'MW39bRz7+gke/PQDeES0FBlGB3PoB7R1tyFCSbFaRGk38cOA3r5eNvKbjue5U1dl+pzT0VffqCrK3Mrycn7fNfuH' +
  'VFXDD30cKdnc3GBoYJCFlSUUoRCGPsVSiY1CniAMUVUVP/AABQVBuJVKkEBMGAz1DVIql7kweRmRNuhMZlmvFZiY' +
  'nmLf+B7623uIa1Fj3eT0FFMrc3TvHMSzHJbWVikUi1iWhQhgoLOXjc1N+vr7+K1f/XWEhN6uHtbzm8SMGDIIsW2H' +
  'YrFMEIRszK2hxTQsvQ3FghNfO8bS4irpjhwyDIllEsxPL/HYPz/G/rsOEhtIUSiU+MY/PoIXSjRTh5BnvKIgDBns' +
  '66dYKGJ7Ds56g9AL6evu5dTJUwVN02a/VabP+RCWUopdB/avLq8sT1975Lqhrp5ubM9GUxVmpqfZvm2UJ44/FY2H' +
  'CUMmpqcYHR3FMAx6u3uYXZ5HIwqUBBBIiWaoiFBSr9dZXV+n5dpRsgxAFZSqFTYKBeyWTeAGFEslKrUaQlOQMkDZ' +
  'Iu3mi0XqtRq+FVXmNgoFLl26xMzMLEKIKMhCUq3XaDaaJIIE+WIRt+Vy/EtPELgBh++9gVhbnKF9w1TKdXwv/KaL' +
  'GTexajbF9RJO4KC5ClrcRLWcKHoOQ8Igeq+KwujIKHNX5hAxFWuzRjaRIWaYrK+tTXW2ta8W55fEs1FTnhWAhfkF' +
  'ps9fbPTs2P5Us9G8qyvXycTcJEanwczCHHv37yeXzlCuVZAITp89za4du8jlstx65CbypTzVZgN1K1WRSae566Y7' +
  'ePrcOaZnZkjEEyTjCWQQ4joumWQOJCwsLTI9PU0gQ5ZWVvADn1wqw0JxBSUUuK7LZn6TeqNBs9HkyvwVTN2gVC7z' +
  'xfv/BY8ARSgYmk48FoeUhms7lDZL+I6HkY5TK9S4cmqG3msGUYRC70gPC5PLICVhGJBpT9Ozs4/N+Q280EOL6wzs' +
  'G8I6MY3TdAi3gJKhpC3TRndnJ8ePPQmGwHc9eke2US5XyOfzp/Kz8/XFhYVnDYWftUvS8z0+8IEPEEunzGxb7nVd' +
  '7Z365NQkWkzHdz1G+ofxw4CllWWEqlCt1rAbLbK5NtLpDKODI5iqTjqRZnRoGzcduoFMPMXTFy5QLBTo6uwmZsZx' +
  'HQfPcblh/7XkMjnmrszx2IknKdeqdGbbUVSNzmw7gesz2jvCQHc/tXqDhtVkYmGGRqUeMaAzGXp6e4ilEgxtG+aO' +
  'm2+jLZNjcX0ZPabjhR6e62OVLUKgnq+iAC3fIZaIEdg+rVoDMx6jf2c/9WqduScmqOeriLiGE3qk0inq+dozU1fC' +
  'IOSavftpy7bx9OR5XN/Ft31uuv5G1tfXnSuzc39u1+qTP/MzP6M8bxN09RcMTTszNzs7dfvtdxxMp9IEjo9mGly6' +
  'dJHd4+OcOncGPwxQVMHp82dpNBrs338N2VyOfbv2IoTADwIalTrHLz3F5uYG6xvrqELhmv0HOLhrP/vG9qAguHT5' +
  'Ek+dOIYtPaQvuf/rD3DL0ZvJZLJcu+sglmWxsrSMGYuh6RpdmQ4uTF9CugH79uylp72b3s5ebNtidWWFk6dOgha1' +
  'ujarEfE2kU5i1W1QVTYmVmnb1UPJ9kn3ZIin4xhxk3qrSVB3sZoOouWQa/jYqkM8FqNnrJe16VUCN0DXNMZ37uLy' +
  '5UtgKDiVJgkzQWdHJ2dOnZ4xDePkliyftVvj27Ii8puborOra6Nnx/aHmq3WwYHeASbnplAUhbnFK+zbfw3D/YPM' +
  'zM9FdWRd4fL0BPML83S0d5BOp1EUhWarSbFcwvJszHRUrjx98Rwzc3O053LoukGz1aRQLiJNlVg2jkBhIb9C/l++' +
  'SGeuHUVRKBQLhFKSiMexHQdXDRExldOXzzE9O00unUNVFWq1GsVaGSWhIVzB3JkpEERZWQSBAEVXcTyf9YvLGHGT' +
  'QiijdPlWWgMhELqCDEI2J1dBgQoSBYXA9gikZHRohLgZY3Z+liAW9WT09/ZRKVfY3Nh8cH32ymq5VBKb+TwvCIBC' +
  'sSi6urvD9uHBL165MveTO7eNZaemJiMujBBMTkxwYN81zC3OPzMXTombOIHP0uYqciMCXtEUNMNAS8aQCiAEeipG' +
  'T3cP+3aNky/kOX5+CWIqQwMDHDl0Lbquc/bi0xG3Z32BZCzBDddeR19XD2v5TU5ePMNgdx/bRkY4dekcaTPJWN82' +
  'hBB4gc+5mYvs2TVOb3sXvuPhux5TczMUK2WuO3yY85OXcLQYu0d2cPbpczQsC5CIyLyDKtAMHYRCq2494/ezBZ6u' +
  '6xw6cIiZmRmaXgvfDZAe7BzbyfT0dN11nX8WQsjv1EX/bRs0rjYZDA8OnlxcWHjcjMXo7e5BSBCqwsT0BJl0hm2D' +
  'w88kxCSgaip63MRIxjCSccx4VIwRELlvQUBXWwe/9L77MHWdHdvH6OjqZKC/n//jp/8DWT2J6kr+z5/5RfaP7yGd' +
  'y3Dfe3+WV971UlqNJvt3jdOWzrFr2xhvf+2bkKFkz45d/OxPvgdT08mlM5iGSdZMMtjVy33v/Rm6Ojrp7+tDInnt' +
  'K17NS257EUcPXMctR46CILrWRAw9EV23bhrPlCk0Q0eLGSgxHcXUCJEMDw6TSaW5OHmREEnoBXS2dxAzY8zPzz/Z' +
  '29V9PJpo8+1HGHxHbujU1BRnn3iq0bFt6OML8/MvHt81bn7j+OP40scSAZOTExw6cJDFlWVc30VBIKVAqIAUCCGj' +
  'mmtEHoj+FuDYDo7tMDyyjfsffIByqcSrXv5Kmo0mH/3sp/A8j20j27j5uqM0Wi0OjO/jt//g95hbXcTQdLS4jhcG' +
  'lMuVqEmk1aLRbKIZBlPzM5SrFb7y8ANc2b6T3bvH+fzXvkTTboEi+PDH/gc/91PvZXVtjf/+0b/DDfwoOxtNPo5U' +
  'QF7NfEaVsKu5IIkkbsQ4fOAgExOXqdsNvMBHepK9u/YwOzvrNWq1jy9dvFybmpr6jh0y37FFKQwjOmBbJnv/zMzM' +
  'E9lsjrZ0G4EXIBWYmJpAEQp7d41HWUNJlHMP5FbyamvXy+gmwjCEUFKrVPmzv/hz1ldXeftb3spw/xDNWoN8oYBu' +
  '6uhJk3yxQLlUxndcNvJ5hK4SS8bQTR0pJS3bolAsEng+tu2wWcizsbFOo94gDEJUU0foKqVKGT1mIAwNRVO5MHWJ' +
  '8xcvcvHyJZY311AU8UwMIGVIuOViErJ13SC3IkkZSPaN70VTNC5PTkRClIKBnj6ymSyzMzPH2rLZr32r7L4rAIQQ' +
  'TE5OipmnL5Rq1cqHZmdn7cMHDmGoOp7t40qfc2fPsm98Lz2d3VEKd+sGZLhV6rv6cyCfydtnszl27NzJqbNnmZic' +
  'wvd9Tp05Q61e58iBazmy7zBCKDz+1BOsrKxw4tRJbj5ylH2j49x25GaSZpxWo8lmIY8IwPM8NgsFPBnS091DKpaA' +
  'IMR3fTY284RbaeWrm2RpdYXNQgGE2BL4t1zn1isqX24FaFs/d3d1s3f3Hs6eO4tLlDLXNJ39e69hbnbWbjUbfzN3' +
  '4VJ+emrqOQ3veE7TUqSU/PVf/7X48Ec+spgvFg5sHxsb912XUqUMAmr1GqlEkh07drKwsBCV7bZSD1fVWcAzUbEE' +
  'PNvB1HTSmQznL5xnaX2FptViZmqKTCKNDEKePPYUa4VNpJDMTM9gN1qk4kk2NzdZz29g1Vusr6xRsxp4lsvm+jqh' +
  'H2K3LDZLeSQRu21jdY1SJZrCK8PoWqxGk83NTepWc8vEfDO4uir0q8ZbbAEU0w1uu/lWSsUSkzMThELiux7bBkfp' +
  '7e7hzOlTX80lU39cWFt3N/P55zRN6/nMCxLj4+Nhz9jobd19fZ+59tprex7+xiNU61WELjAxuPP2O9nIb/DE8acI' +
  '2aLYqwoxM4YMQxQ1ajeVSDw/QPo+oRcQS8QRmopEoqtaZELCqN0JNbo8JYRmo4mmqcQSCUIZ4rZsdF1HixtRU121' +
  'HmUnEzHYKmvalo0SyqhuoIpn7Lq6VUQSImJDSCVKMZiaQegH+EFAsFXEl2GIIgRHr7uBnu4eHnv8G9gimjmXTeV4' +
  '8Z0v5uyZM/mVpcU3FuaXHp6YmHjOk7Sez6wIKaUU7/+T//zEf/7AX3+wp7v7d649eFh5+LFHokF42Bw7/hS33XY7' +
  'B5tNzlx4GglsH9oWpR0Sia0ASgUpafo2nbkOqpUqAlhZXcP2HPbv2Uur1UIIQS6T4+nLF+jq7CRuxKg16hHvKJWm' +
  'WCwig5DBoSidIEPJE8efoq+vj/a2NsyYyeraGpZls3fnbmq1Kj5hlGr3oa+vl2q1Qi6bYyOfR9c1mpaFkFApluju' +
  '6eH46ZPYfkREvmbvNYwMj/D4449hyyhdb+gGhw8eZmN9Xa4sL33onT/+xm/82Z/8qZiYmHjOA/2e88AmIQSFQkG8' +
  '9sd+LOwZ6L+8sblxeOeu3WOGYVCqFAn9gJbVotVocf2RG3A9l818nlQ8HvnQgOO7OI6DYznYjoXdiG7YsR0CGbKR' +
  '38BxHDzXe4alsFnYxHM9iqUSbdkc5UqFQqGAH/gkEkmq1RqNWjQPNF8qoGkaoeNTq1RZWltBCEG9UsX1XHzPiw7W' +
  'MKRZb9BoNaMmQdeLivJ+gG3bbBbyBIHPRmEThGDf+F4OHTzEyZMn2ChvEgQ+Ugr27NhDb08vJ48ffziVSPz6v3z+' +
  'C7U3v/nNz2uE2QsZWSbGx8fD3rHRG9q7Oj91+x13bn/siW+wtrmGVMH3fHYN7+LQ4UOcPHuKS5OXMfSIlyQVsUVr' +
  'h2CrviqEQFUUpIBwyz5HufOIC/TM4SiIhLvlWYgt/pDvRfGHqqhs+YxR+sOPiAjK1iEblUAjD2zrNqL6bShRhHim' +
  '6U5V1YgrtMWO2LN7D9dfe4TTJ09yZfkKgQwJ3IChgUFuvfk2Hn/ssYXN9bW3FheWn5icnFSe79SmFzIxS66vrYv1' +
  '2SvHN9bXf+fM6dPV22+5nc6OLqSM7On0lSnOnD7NHbffzi233ozUINRDQiViTgREAZskqpZ5gb/VIRMQhFEqWRLi' +
  'B/6W8KLv9oOr/ydBgVgqQSKbQqgRLTyU0ecFW/wciPL1obz6klz1jK9+txQQCEmoSlAFoRoidVBjKjfdfCO3334b' +
  'Z06dYmZxlkCRBFLS3dnNrTffxtNPn6sVNjf+Y2F+6clKqSzCMHxewn9BAAghKFfKQkopbr3+6KdnZ6b/eGp6yrnn' +
  '5a8km8wQuD5CV5hbW+DYqePcevetvOaNryHX34GW0hH6FhNuK9AJt5hr3/oKtnZfGP6vghO6wMzEUU2NVCbNr/zS' +
  'L/Cu976TWCKaA6rFDKS4GnNEwg/Crc/ZYnX/L98lt8Dc2v2KrqAlDdoGO3jVG17FnS+9k5MnTzKzPIfQFAI/oDPX' +
  'wate+SoW5ufd+bm5Pz16+LpPAaxtrL+gmXEvaGjf1fPgvp97X/i3H/nI6cWl5VQmnbnhlptuVpaWl3BCDzWmUaqW' +
  'Wcuvc+crXsRtt95CsVoiny8gvW/62s9syWjDPpMwk2LLYd36v0wuw5133s473vw2BgcHWVxaRO+Ns1pYp7C0yWtf' +
  'dy/33PNyVFWlkC/i2PZWzVbwjApddTWv3sfWH4qioOgCNWFw4PoDvOc976J9oIPPf/oLzM7PIZGoikZ7Kstr77mX' +
  'peWl4NTJk/81l0r/4RMPPWxPTEy84MHeL3hu6FUQfu+3f8cdHt12bGp6qqOjo+Pw3S9+ibK8tkLdaiBlGLWLbq5x' +
  '4NB+bj5yA+V8mbXlta2Db6uo/01xREWRrV0PkEzE2TW+i1e//lWMHdxJNazRP9LPsYePUSvXqBVruE2bF7/+bipO' +
  'nbE9Y+wZ302r1qJereNucZBkGI26l1vaF+1W8YwNMOIGR2+5gZ/6yXfiS49PfvwfWJiZJ/R8CKGvs5c3vfYNzC8s' +
  'hI8/9tjf5TKZ35o8c672lre85QWPrITvzexoMT4+Hu4+fLC9YbX+4MV33/2ew9deq33ys/+ThfUlpAp61iSZTrNv' +
  'zx72ju5mdXqZRx95jOXl5WcO4qvC727vYvvYGLqpMzA4QHtvB4v5ZVRTJdOZZXV9DddyWJte4dYDN2G7DsfOH6dn' +
  'rJ/2rk4GBvoprRex6i0GuvtobNRYXV7FdRymp6cplEtwlUu01awxNDzEbXfdSv+uQabmpjh3/gK1chWv6qBLleGe' +
  'Id7x5rdx6vRp/4H77/+7RCz+m9Nnny4+H3//+wbAVob2KgiZWqv5G7ffcccv3HXXXYmvPPQ1njp/AsQ3qS5t6RzX' +
  'X3Mtvd29zEzOcPrMGTaL+UgYCOK6yb69+9i7by+9fb3omk7DbXFlZYHVtRUC30cognKrxitueilWq8UDT309esxJ' +
  'LI6qqnR0dLJtYIRULCp5FjeLXLhwnqfPn8dybUJAUQTdnV0cPnyYnbt3sbq5yslzJ8mXiiiqQNN0VFSO7D3Ma191' +
  'Lw8+9JD96MOPfKC7o+P3zzz2ZGViYkLZyit+d7v3ezI9fQuE3bt3y4M3HTXXNjfec/Tmm377TW98Y/fp82f4x3/+' +
  'J2r1Coqm4HkBqi/o7+pj7769dLZ3srK6wvmLF1hfX8ezo27M9rZ2hkdGGBsbI7U19WQ9v0HH9k7imSSPP/g4R8YP' +
  '43k+EytTHLn1CNVShepCmYGeAQBarSbT09MsLi5SLBajMZoxg96eXvbv28fA4CDFYpFLly6xsrlCoEVnhK4ZJMw4' +
  '977y1dxw5Hr+8XOfKxx74qnfH+js+dDpJ560Jycnr2ZUvuv1PX2CxtWJum9845uUR54+dffw6Mgf3P2Su69DSv71' +
  'wQe4sjSP736T4q0rGt1dPezevZv2zg6q1QoLVxZYXl6iUq5EU1RME1VRyKQzuKHH3rsPIes+CTXO8LZhgjBkc3OT' +
  '3GAbK+trnPnycZKxBLVaDT/wsR0HXdPI5XIMDA8yMjxCJpOhkC8wMzPDen4DL3BRdIFhxghlyGDvIC+5825iiRgP' +
  'fv2hc0tzC7/9ipvu+PLf/d2Hw++l8L/nAFwFIZlMyuHhYdk3vmO7auq/vm///rft3b0nMTc3x8mTJ2lYTXy5lRiT' +
  'oCBIJ9P0DwzQ19cXDf2o1NnY2KBQKNCoN3BchzAI2H/TQV50z11sbG5SLVeigCuUbGxusjyzRGW5hCIEhmmSyWTo' +
  '6uqip6eHTC6L6zmsrqyyurRCtV6LXFZB1PemKmQzWQ4fPMzYtu1MTE1YFy9e/Affcf9wY3puem1tTVQqle/5Y0y+' +
  'X8+QQVVVdu3aJfddfySerxRfm821/equnbsOdXZ2irmFK0zPTkVdj4FEKFHVyfNcdHTS6UxUU06l0A0DRYl88KWl' +
  'RWJDKdzQY/7UDNu3jSH9gOnpKcZuHEdVVGTeZ2hoKJpP7fs4tkO9HnXz12o1nMDd6utVoqBPSjKZDGPbdjC6bRuV' +
  'ckXOTE+dr1Vrfz7Q0/vZU4893pyamhJBEHxfniHz/X6Mlejq6pIdHR1ycHznsO26P9XR2fmuHTt2DmdzWZaWl5i7' +
  'MketWYvmQAhQhBoxzoKon9fQTQzDIG7GcV0HPxaS6MnQWq+zZ2QXHR0dVKwKaleMyycuojSjlEWz2YxGG3gRmUqo' +
  'UWrD38oxxeIx4vE4w8PDDA8NY7dsZqanVwv5/EdjpvGhxUuTC6VSiXw+/319ptgP5jlimiZ37NjB69/yJuXxEyf2' +
  'hcifbO/oeN3Q8PBQJpelVquyvLJEoVTE9V2kH0QxkwBV16KudSfqQQ58n46Rbg7eeIjB/gGkhPnFeS6duEBptYBU' +
  'ol40RY36zYQSBXbIqFZtmCbpeJqhoSHa2tqp1aosLiysVcqVz+uK8rcH9+479+XP/1M4OzOD5/v/fp8j9m8BEYvF' +
  '5OjoqLzzZS/VLk9P7Q5k+KZEKvVjXb3du7t6ug3DNKiUyhQLBWqNBi27hR8GCC3qJbCrLTzLZcfhXfTuHCA/u061' +
  'XCXenQJHMn9+FqEo0dTeeESg1VWNRDxJNpulo6ODRCoZdcYXCl5hIz/Tqje/oCvqZw7s2Xvh/i/9izc3Nyccx/m+' +
  'C/4HDsC3ApFIJOTIyIj8td/8DeWz//SF3lqzcbuiaa9OppM35jrahto62/V0OkMQBjSb0SCnZq1OvRpN1k30pHAc' +
  'h75YN7qukdyWpdmymD0xRSIeJ9ueI5VLk0wmicViKEJgt2yqxYpXKpZWGvX6Md9x/yVumA+/4q67V/72Qx8Kl5aW' +
  'RKPR+IEJ/ocGwLcCEY/FZE9vL93bhuWRQ4eNydnZQdtzj6CKG824eV0yk9qRzqQ7EpmkacZixGIxaqUaly5fQk8Z' +
  '7Bzcztj4GHPrC0wev8SevXvJtGWxbTuaSVRvOvVqrdio1madpn1aBvKJuGme2jG8bfnE+bNOfWVdrKyuYlnWD1zw' +
  'P3QAvgUIhBAim8nI3r4+fuG+X5LDfYPibz/9iXS5Xun3w3A0FOFORdNGdEMfEFJ0NVvNQ2M37G5vy+ZYW17HrrSo' +
  'rBXzsUT8HAp5z/VWfcdbEIg5Q9Xm2jPZlfe+7Z2Nk6dPh5/81CdEIZ+nWCr9wB7Y+SMNwLeuq48kTyQSsr+/H9d1' +
  'ZSKRoLC4Qedwj/i1X/g19V+feKStIGufN7qSt1DyEb7khhtuZGLi8v2qF7zpxUduq7//L98fWg1LxlNxLMvC0HWx' +
  'tr7OD8PEfKf1I/VM+a3dKC3LYnY26mu42lnSuNLiT/7qT4KXv/re2tp0Yc0NPAba+xnqH0KGIZZlbd54+HDz/X/5' +
  '/vDK3Fz06PJvfubVz/+REj68gILMD3pdFaDjulyZm+NrX/qikzTiX283c8Fg/yCapjE9PR1oqvrER//mw97c3Byu' +
  '531zZMKP+PqRB+Bb1+j27Ry+5caMHwSvNnXTWl5c8i9PXPbCMGi1Wq17b7zrzsz27dt/2Jf5vNa/KwAA+nr7bBmG' +
  'f5bfWP/xRqNxNvSDM8V84Q2B5/9Zb0+P/d1/ww92/Ugdws/legG5e/du3ve+n+NLD3/9kCKE/IWf+ulzv/Irv8xW' +
  'H9b3NFv5fb+hf2cAAFEMoSiKjMViQPSAnTAMf+Q8nOeyfqS8oOe6tvoWsL5lCN6/R+HDv8Mz4P9r638D8ENe/y+q' +
  '9HejHawV5AAAACV0RVh0ZGF0ZTpjcmVhdGUAMjAyNi0wOS0yMFQxNjowODoyOCswMDowMCvlBi0AAAAldEVYdGRh' +
  'dGU6bW9kaWZ5ADIwMjYtMDktMjBUMTY6MDg6MjgrMDA6MDBauL6RAAAAAElFTkSuQmCC';

let cached: Promise<DecodedImage | null> | null = null;

/**
 * Decodes the brand mark once per isolate. A mark that somehow fails to decode
 * yields `null`: the wordmark, the metadata block and the footer are all drawn
 * as text, so the delivery stays branded and never falls back to the original.
 */
export const getBrandMark = (): Promise<DecodedImage | null> => {
  if (!cached) {
    cached = (async () => {
      try {
        const binary = atob(BRAND_MARK_PNG_BASE64);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
        return await decodePng(bytes);
      } catch {
        return null;
      }
    })();
  }
  return cached;
};

/** Test seam: the raw bytes, so a test can assert the embedded mark is a PNG. */
export const brandMarkBytes = (): Uint8Array => {
  const binary = atob(BRAND_MARK_PNG_BASE64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
};
