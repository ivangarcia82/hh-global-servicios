/* eslint-disable no-unused-vars */
const admin = require("firebase-admin");
const { onRequest } = require("firebase-functions/v2/https");
const express = require("express");
const fetch = require("node-fetch");
const html_to_pdf = require("html-pdf-node");
const ExcelJS = require("exceljs");

admin.initializeApp();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

async function generateExcelFile(lineItems, logoUrl, title) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Quotation");

  // Fetch and add the logo
  const fetch = require("node-fetch");
  const response = await fetch(logoUrl);
  const logoBuffer = await response.buffer();
  const logoId = workbook.addImage({
    buffer: logoBuffer,
    extension: "png",
  });

  worksheet.addImage(logoId, {
    tl: { col: 0, row: 0 },
    ext: { width: 120, height: 50 },
  });

  // Add a title
  worksheet.mergeCells("B2:E2");
  const titleCell = worksheet.getCell("B2");
  titleCell.value = title || "Generando Ideas - Cotización";
  titleCell.font = { bold: true, size: 16 };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };

  // Add the generation date
  worksheet.mergeCells("B3:E3");
  const dateCell = worksheet.getCell("B3");
  dateCell.value = "Generada el: " + new Date().toLocaleString();
  dateCell.font = { italic: true, size: 12 };
  dateCell.alignment = { horizontal: "center", vertical: "middle" };

  // Add headers
  const headerRow = worksheet.addRow([
    "Producto",
    "Cantidad",
    "Precio Unit",
    "Precio Total",
  ]);
  headerRow.font = { bold: true };
  headerRow.alignment = { horizontal: "center", vertical: "middle" };
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFC000" }, // Light orange header background
    };
    cell.border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };
  });

  // Add line items
  lineItems.forEach((item) => {
    const row = worksheet.addRow([
      item.description,
      item.quantity,
      `$${parseFloat(item.unitPrice).toFixed(2)}`,
      `$${parseFloat(item.totalPrice).toFixed(2)}`,
    ]);
    row.alignment = { horizontal: "center", vertical: "middle" };
    row.eachCell((cell) => {
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
    });
  });

  // Adjust column widths
  worksheet.getColumn(1).width = 20; // Producto
  worksheet.getColumn(2).width = 10; // Cantidad
  worksheet.getColumn(3).width = 15; // Precio Unitario
  worksheet.getColumn(4).width = 15; // Precio Total

  // Add a footer (optional)
  worksheet.addRow([]);
  const footerRow = worksheet.addRow(["Gracias por su preferencia"]);
  worksheet.mergeCells(`A${footerRow.number}:D${footerRow.number}`); // Merge cells A-D in the footer row
  footerRow.font = { italic: true, size: 12 };
  footerRow.alignment = { horizontal: "center", vertical: "middle" };

  // Return the Excel file as a Buffer
  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
}

app.get("/", async (req, res) => {
  res.send("Hola Mundo");
});

app.post("/createDraftOrder", async (req, res) => {
  console.log("ENTRÉ A LA FUNCTION");
  //RECIBIR OBJETO
  const lineItems = [];
  const htmlLineItems = [];
  let precioOrden = 0;
  const months = [
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre",
  ];

  const date = new Date();

  const day = date.getDate();
  const month = months[date.getMonth()];
  const year = date.getFullYear();

  const formattedDate = `${day} de ${month} de ${year}`;
  const totalValue = req.body.data.total_price;
  const totalFormattedPrice = (totalValue / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
  const totalOrderPrice = totalFormattedPrice;
  console.log("ENTRE AL FOR");
  for (let index = 0; index < req.body.data.items.length; index++) {
    lineItems.push({
      variantId:
        "gid://shopify/ProductVariant/" + req.body.data.items[index].variant_id,
      quantity: req.body.data.items[index].quantity,
    });

    const value = parseFloat(req.body.data.items[index].price);
    const formattedPrice = (value / 100).toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
    });

    const name = req.body.data.items[index].title;
    const quantity = req.body.data.items[index].quantity;
    const description = req.body.data.items[index].product_description;
    const image = req.body.data.items[index].featured_image.url;

    const price = formattedPrice;

    const totalPrice = parseFloat(value / 100) * quantity;
    const formattedTotalPrice = totalPrice.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
    });

    htmlLineItems.push(`
    <tr>
    <td style="text-align: left;"><img style="width: 30px;" src="${image}"/></td>
    <td style="text-align: left;">${name}</td>
    <td style="text-align: left;">${description}</td>
    <td>${quantity}</td>
    <td>Pieza</td>
    <td>${price}</td>
    <td>${formattedTotalPrice}</td>
    </tr>`);
  }

  let htmlLineItemsString = htmlLineItems.join("");

  const draftOrder = await (
    await fetch(
      "https://gi-hh-global.myshopify.com/admin/api/2023-04/graphql.json",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": "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",
        },
        body: JSON.stringify({
          query: `
        mutation draftOrderCreate($input: DraftOrderInput!) {
          draftOrderCreate(input: $input) {
            userErrors {
              field
              message
            }
            draftOrder {
              id
              invoiceUrl
              completedAt
            }
          }
        }
      `,
          variables: {
            input: {
              lineItems: lineItems,
              email: req.body.email,
              note: `${req.body.company} - ${req.body.phone}`,
            },
          },
        }),
      }
    )
  ).json();

  let options = { format: "A4" };

  let fileHTML = {
    content: `<!DOCTYPE html>
  <html>
<head>
  <title>Cotización GI</title>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
  <meta name="viewport" content="width=device-width">
  
  <style>
      body {
          margin: 0;
          font-family: Arial, sans-serif;
      }
      section {
          background-color: #f2f2f2;
          padding: 20px;
          display: flex;
          align-items: center;
          justify-content: space-between;
      }
      section div {
          flex: 1;
          padding: 20px;
      }
      h2 {
          font-size: 12px;
      }
      img {
          max-width: 100%;
      }
      table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 20px;
      }
      table th, table td {
          padding: 10px;
          text-align: center;
          font-size: 12px;
      }
      table th {
          color: black;
          font-size: 12px;
      }
      table tr:nth-child(even) {
          background-color: #f2f2f2;
          font-size: 12px;
      }
      table tr:nth-child(odd) {
          background-color: #fff;
      }
      a {
          text-decoration: none;
          color: #007cc2;
          font-size: 12px;
      }
      a:hover, a:active, a:visited {
          color: #333;
      }
      p{
          font-size: 12px;
      }
      p.term {
          font-size: 12px;
          margin: 10px 0;
      }
      /* Styles for the image */
      img.fullWidthImage {
          max-width: 100%;
          height: auto;
          margin-top: 20px;
      }
  </style>
</head>
<body>
  <section>
      <div>
          <img src="https://cdn.shopify.com/s/files/1/0641/0338/3246/files/Logo_Inicio_1080x266_ffd1075f-6821-4fb0-a7ae-19e4c844dcf1.png?v=1731683448" style="width: 60%;" src="" alt="GI Logo" />
      </div>
      <div>
      <p id="date">Fecha: ${formattedDate}.</p>
      <p>Estimado cliente.</p>
      <p>Anexo encontrará la propuesta de lo solicitado:</p>
          </div>
      </section>
  
      <table>
          <thead>
          <tr>
            <th>Imagen</th>
            <th>Nombre</th>
            <th>Descripción</th>
            <th>Cantidad</th>
            <th>UM</th>
            <th>Precio Unitario</th>
            <th>Importe</th>
          </tr>
          </thead>
          <tbody>
            ${htmlLineItemsString}
          </tbody>
      </table>
      <div>
      <p style="font-weight:bold; margin-left:4rem; text-align: right; margin-right: 12%;">Total: ${totalOrderPrice}</p>
      </div>
  
       <div style="margin-left: 4rem; page-break-before: always;">
            <pre class="term-conditions" style="text-align: center; font-family: Arial, sans-serif; margin-top 50px;">
        Términos del servicio
        14 septiembre de 2023
        
        Ciudad de México, México.

        Atención

        Brenda Gallardo / LATAM Manager of Promo Branded Merchandise
        
        Global Brand Management Mexico

        Con base en las necesidades detectadas y con el fin de ayudar al equipo comercial de todo el grupo de HH Global, Generando Ideas y el equipo de Sourcing han acordado el desarrollado una herramienta para cotizar, revisar existencias, solicitar apartados de mercancía y de muestras físicas para los productos considerados de línea y que pueden ser provistos por Generando Ideas.

        Nos referiremos a esta herramienta como el Cotizador Generando Ideas, mismo que se encontrará alojado en los servidores del proveedor y cuyo mantenimiento, actualización y mejoras serán invertidos por Generando Ideas, como parte del proyecto integral para HH Global el cual es previsto desarrollarse en los años 2024 y 2025.

        El Cotizador Generando Ideas se apegará a los siguientes términos y condiciones mismas que aplican para las razones sociales del grupo:

        Global Brand Management México
        
        Adare International
        
        INWK México

        PRECIOS

        Los precios de los productos de este cotizador no incluyen IVA y se encuentra sujetos a cambios sin previo aviso, mismos que serán actualizados automáticamente y tendrán una vigencia de 15 días naturales después de realizada una cotización. Los precios establecidos en el cotizador no incluyen brandeo / decorado /logo y únicamente una entrega en la Ciudad de México o Área Metropolitana.

        Los precios son expresados en moneda nacional y aplican a toda la República Mexicana. El precio incluye todos los términos establecidos en el contrato con HH Global.

        DISTRIBUCIÓN Y TIEMPOS DE ENTREGA:

        Los tiempos de entrega se cuentan a partir de la recepción de la OC y autorización del render confirmado vía correo y/o físico. Favor de considerar que, en caso de requerir muestras, se debe de considerar este mismo tiempo únicamente para la entrega de la muestra + tiempo de entrega. Ej: muestra sin impresión 2-5 días+ tiempo de entrega después de aprobación 2-5 días.
        
        Local. Área metropolitana de la Cuidad de México:
        
        Con impresión: 5 a 15 días hábiles
        
        Sin Impresión: 2 a 5 días hábiles 
        
        Foránea. Interior de la República Mexicana:
        
        Tenemos cobertura en todo México, para cualquier orden nos comprometemos a enviar el producto por flete terrestre, flete aéreo o paquetería de acuerdo con las instrucciones de nuestros clientes. El tiempo es el mismo que en una entrega local más el tiempo de paquetería:
        
        Flete Normal: 2 a 5 días hábiles.
        
        Flete Garantía Entrega Día Siguiente: 1 día hábil
        
        Las entregas locales en CDMX o Área Metropolitana son sin costo para el cliente.
        
        Los envíos foráneos se determinan para cada proyecto y no están incluidos en este cotizador. Para poder cotizarlo se necesita contactar al ejecutivo a cargo de la cuenta.
        
        PROYECTOS CON IMPRESIÓN:
        
        (PERSONALIZACIÓN / DECORADO / APLICACIÓN)
        
        Proceso:
        
        1. El Account por parte del cliente deberá enviar siempre por correo el arte en curvas, en formato AI o PDF Editable para poder procesar el proyecto. IMPORTANTE: Por procedimiento interno de calidad Generando Ideas, no tiene permitido trazar ningún arte a menos que sea solicitado por escrito y bajo el entendimiento que no garantizamos que el diseño sea idéntico a lo que el cliente espera.
        2. Generando Ideas generará un render con las características solicitadas por el account. Y lo enviará para su Vo. Bo.
        3. En caso de requerir muestra física, se realizará la impresión para su Vo. Bo. Previo a una producción/personalización masiva. Sin este ok, no se puede avanzar con la personalización masiva.
        4. En caso de no requerir muestra física, se solicitará la aprobación vía correo y posteriormente a tener el ok, se iniciará el proceso de producción y se confirmará la fecha de entrega.

        GARANTÍA

        Todos nuestros productos están garantizados contra cualquier defecto de fabricación, impresión y/o funcionamiento durante al menos 3 meses. * Esta garantía puede extenderse hasta 24 meses en función de la naturaleza del proyecto.
        
        NOTAS ESPECIALES
        
        • El decorado de los productos en caso de ser requerido debe revisarse con el ejecutivo de cuenta por parte de GI.
        • Apartado de material tendrá una vigencia de 3 días naturales.
        • La cotización que arroje esta plataforma no puede representar una PO, será necesario contar con ella asignada a cada una de las plataformas de las cuentas (Ichor, HHUB y VALO).

        Atentamente, 
        Antonio Quiroz Osornio
        Key Account Manager
      </pre>

      </div>
  </body>
  </html>
  `,
  };

  html_to_pdf.generatePdf(fileHTML, options).then((pdfBuffer) => {
    const file = {
      filename: `cotizacion.pdf`,
      data: pdfBuffer,
    };

    console.log("LOGGER DRAFT ORDER", draftOrder.data.draftOrderCreate);
    // Set the headers to indicate a PDF file
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'inline; filename="cotizacion.pdf"');

    // Send the PDF buffer as the response
    res.send(pdfBuffer);
  });
});

app.post("/checkDraftOrders", async (req, res) => {
  const draftOrders = await (
    await fetch(
      "https://gi-hh-global.myshopify.com/admin/api/2023-04/graphql.json",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": "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",
        },
        body: JSON.stringify({
          query: `
    query {
draftOrders(first: 10, query: "customerId:${req.body.customerId}"){
edges{
  node{
    id
    name
    createdAt
    status
    totalLineItemsPriceSet{
      shopMoney{
        amount
      }
    }
    lineItems(first:50){
      edges{
        node{
          id
          image{
            url
          }
          title
        }
      }
    }
  }
}
}
}
  `,
        }),
      }
    )
  ).json();

  console.log("LAS DRAFT ORDERS SON:", draftOrders.data.draftOrders.edges);

  res.send(draftOrders.data.draftOrders.edges);
});

app.post("/getDraftOrder", async (req, res) => {
  try {
    console.log("ENTRANDO 2");
    const { draftOrderId } = req.body;

    if (!draftOrderId) {
      return res.status(400).send({ error: "Draft Order ID is required." });
    }

    // Fetch draft order data from Shopify
    const response = await fetch(
      "https://gi-hh-global.myshopify.com/admin/api/2023-04/graphql.json",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": "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",
        },
        body: JSON.stringify({
          query: `
            query($id: ID!){
              draftOrder(id: $id){
                id
                email
                subtotalPriceSet{
                  shopMoney{
                    amount
                  }
                }
                lineItems(first: 200){
                  edges{
                    node{
                      title
                      quantity
                      product{
                        description
                      }
                      image{
                        url
                      }
                      originalUnitPriceSet{
                        shopMoney{
                          amount
                        }
                      }
                    }
                  }
                }
              }
            }
          `,
          variables: { id: draftOrderId },
        }),
      }
    );

    const result = await response.json();

    if (!result.data || !result.data.draftOrder) {
      return res.status(404).send({ error: "Draft order not found." });
    }

    const draftOrder = result.data.draftOrder;

    // Prepare line items for the PDF and CSV
    const lineItems = draftOrder.lineItems.edges.map((edge) => {
      const node = edge.node;
      return {
        title: node.title,
        description: node.product.description,
        image: node.image.url,
        quantity: node.quantity,
        unitPrice: parseFloat(
          node.originalUnitPriceSet.shopMoney.amount
        ).toFixed(2),
        totalPrice: (
          node.quantity * parseFloat(node.originalUnitPriceSet.shopMoney.amount)
        ).toFixed(2),
      };
    });

    // Generate PDF HTML content
    let htmlLineItems = lineItems
      .map(
        (item) => `
      <tr>
       <td style="text-align: left;"><img style="width: 30px;" src="${item.image}"/></td>
        <td>${item.title}</td>
         <td>${item.description}</td>
        <td>${item.quantity}</td>
        <td>Pieza</td>
        <td>$${item.unitPrice}</td>
        <td>$${item.totalPrice}</td>

      </tr>
    `
      )
      .join("");

    const htmlContent = `
      <!DOCTYPE html>
  <html>
<head>
  <title>Cotización GI</title>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
  <meta name="viewport" content="width=device-width">
  
  <style>
      body {
          margin: 0;
          font-family: Arial, sans-serif;
      }
      section {
          background-color: #f2f2f2;
          padding: 20px;
          display: flex;
          align-items: center;
          justify-content: space-between;
      }
      section div {
          flex: 1;
          padding: 20px;
      }
      h2 {
          font-size: 12px;
      }
      img {
          max-width: 100%;
      }
      table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 20px;
      }
      table th, table td {
          padding: 10px;
          text-align: center;
          font-size: 12px;
      }
      table th {
          color: black;
          font-size: 12px;
      }
      table tr:nth-child(even) {
          background-color: #f2f2f2;
          font-size: 12px;
      }
      table tr:nth-child(odd) {
          background-color: #fff;
      }
      a {
          text-decoration: none;
          color: #007cc2;
          font-size: 12px;
      }
      a:hover, a:active, a:visited {
          color: #333;
      }
      p{
          font-size: 12px;
      }
      p.term {
          font-size: 12px;
          margin: 10px 0;
      }
      /* Styles for the image */
      img.fullWidthImage {
          max-width: 100%;
          height: auto;
          margin-top: 20px;
      }
  </style>
</head>
<body>
  <section>
      <div>
          <img src="https://cdn.shopify.com/s/files/1/0641/0338/3246/files/Logo_Inicio_1080x266_ffd1075f-6821-4fb0-a7ae-19e4c844dcf1.png?v=1731683448" style="width: 60%;" src="" alt="GI Logo" />
      </div>
      <div>
      <p>Estimado cliente.</p>
      <p>Anexo encontrará la propuesta de lo solicitado:</p>
          </div>
      </section>
  
      <table>
          <thead>
          <tr>
            <th>Imagen</th>
            <th>Nombre</th>
            <th>Descripción</th>
            <th>Cantidad</th>
            <th>UM</th>
            <th>Precio Unitario</th>
            <th>Importe</th>
          </tr>
          </thead>
          <tbody>
            ${htmlLineItems}
          </tbody>
      </table>
      <div>
      <p style="font-weight:bold; margin-left:4rem; text-align: right; margin-right: 12%;">Total: ${draftOrder.subtotalPriceSet.shopMoney.amount}</p>
      </div>
  
      <div style="margin-left: 4rem; page-break-before: always;">
            <pre class="term-conditions" style="text-align: left; font-family: Arial, sans-serif; margin-top 50px;">
        Términos del servicio
        14 septiembre de 2023
        
        Ciudad de México, México.

        Atención

        Brenda Gallardo / LATAM Manager of Promo Branded Merchandise
        
        Global Brand Management Mexico

        Con base en las necesidades detectadas y con el fin de ayudar al equipo comercial de todo el grupo de HH Global, Generando Ideas y el equipo de Sourcing han acordado el desarrollado una herramienta para cotizar, revisar existencias, solicitar apartados de mercancía y de muestras físicas para los productos considerados de línea y que pueden ser provistos por Generando Ideas.

        Nos referiremos a esta herramienta como el Cotizador Generando Ideas, mismo que se encontrará alojado en los servidores del proveedor y cuyo mantenimiento, actualización y mejoras serán invertidos por Generando Ideas, como parte del proyecto integral para HH Global el cual es previsto desarrollarse en los años 2024 y 2025.

        El Cotizador Generando Ideas se apegará a los siguientes términos y condiciones mismas que aplican para las razones sociales del grupo:

        Global Brand Management México
        
        Adare International
        
        INWK México

        PRECIOS

        Los precios de los productos de este cotizador no incluyen IVA y se encuentra sujetos a cambios sin previo aviso, mismos que serán actualizados automáticamente y tendrán una vigencia de 15 días naturales después de realizada una cotización. Los precios establecidos en el cotizador no incluyen brandeo / decorado /logo y únicamente una entrega en la Ciudad de México o Área Metropolitana.

        Los precios son expresados en moneda nacional y aplican a toda la República Mexicana. El precio incluye todos los términos establecidos en el contrato con HH Global.

        DISTRIBUCIÓN Y TIEMPOS DE ENTREGA:

        Los tiempos de entrega se cuentan a partir de la recepción de la OC y autorización del render confirmado vía correo y/o físico. Favor de considerar que, en caso de requerir muestras, se debe de considerar este mismo tiempo únicamente para la entrega de la muestra + tiempo de entrega. Ej: muestra sin impresión 2-5 días+ tiempo de entrega después de aprobación 2-5 días.
        
        Local. Área metropolitana de la Cuidad de México:
        
        Con impresión: 5 a 15 días hábiles
        
        Sin Impresión: 2 a 5 días hábiles 
        
        Foránea. Interior de la República Mexicana:
        
        Tenemos cobertura en todo México, para cualquier orden nos comprometemos a enviar el producto por flete terrestre, flete aéreo o paquetería de acuerdo con las instrucciones de nuestros clientes. El tiempo es el mismo que en una entrega local más el tiempo de paquetería:
        
        Flete Normal: 2 a 5 días hábiles.
        
        Flete Garantía Entrega Día Siguiente: 1 día hábil
        
        Las entregas locales en CDMX o Área Metropolitana son sin costo para el cliente.
        
        Los envíos foráneos se determinan para cada proyecto y no están incluidos en este cotizador. Para poder cotizarlo se necesita contactar al ejecutivo a cargo de la cuenta.
        
        PROYECTOS CON IMPRESIÓN:
        
        (PERSONALIZACIÓN / DECORADO / APLICACIÓN)
        
        Proceso:
        
        1. El Account por parte del cliente deberá enviar siempre por correo el arte en curvas, en formato AI o PDF Editable para poder procesar el proyecto. IMPORTANTE: Por procedimiento interno de calidad Generando Ideas, no tiene permitido trazar ningún arte a menos que sea solicitado por escrito y bajo el entendimiento que no garantizamos que el diseño sea idéntico a lo que el cliente espera.
        2. Generando Ideas generará un render con las características solicitadas por el account. Y lo enviará para su Vo. Bo.
        3. En caso de requerir muestra física, se realizará la impresión para su Vo. Bo. Previo a una producción/personalización masiva. Sin este ok, no se puede avanzar con la personalización masiva.
        4. En caso de no requerir muestra física, se solicitará la aprobación vía correo y posteriormente a tener el ok, se iniciará el proceso de producción y se confirmará la fecha de entrega.

        GARANTÍA

        Todos nuestros productos están garantizados contra cualquier defecto de fabricación, impresión y/o funcionamiento durante al menos 3 meses. * Esta garantía puede extenderse hasta 24 meses en función de la naturaleza del proyecto.
        
        NOTAS ESPECIALES
        
        • El decorado de los productos en caso de ser requerido debe revisarse con el ejecutivo de cuenta por parte de GI.
        • Apartado de material tendrá una vigencia de 3 días naturales.
        • La cotización que arroje esta plataforma no puede representar una PO, será necesario contar con ella asignada a cada una de las plataformas de las cuentas (Ichor, HHUB y VALO).

        Atentamente, 
        Antonio Quiroz Osornio
        Key Account Manager
      </pre>

      </div>
  </body>
  </html>
    `;

    console.log("a generar");

    // Generate PDF
    const pdfBuffer = await html_to_pdf.generatePdf(
      { content: htmlContent },
      { format: "A4" }
    );

    const excelBuffer = await generateExcelFile(
      lineItems,
      "https://cdn.shopify.com/s/files/1/0641/0338/3246/files/Logo_Inicio_1080x266_ffd1075f-6821-4fb0-a7ae-19e4c844dcf1.png?v=1731683448",
      "Generando Ideas - Cotización"
    );

    // Respond with PDF and CSV
    res.status(200).send({
      pdf: pdfBuffer.toString("base64"),
      xls: excelBuffer.toString("base64"),
    });
  } catch (error) {
    console.error("Error generating draft order data:", error);
    res
      .status(500)
      .send({ error: "An error occurred while processing the request." });
  }
});


exports.serviciosHHGlobal = onRequest({
  memory: "2GiB",
  timeoutSeconds: 540,
  concurrency: 80, // Optional for Gen 2
}, app);