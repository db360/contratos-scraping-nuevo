const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const mysql = require('mysql2/promise');

// Configuración de la conexión a MySQL
const connectionConfig = {
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'contratos_marbella'
};

// Leer el archivo CSV y cargar los datos a MySQL
async function loadCSVToMySQL(filePath) {
  const connection = await mysql.createConnection(connectionConfig);

  try {
    const stream = fs.createReadStream(filePath);
    const parser = csv({
      mapHeaders: ({ header }) => header.trim(), // Ajusta los encabezados si es necesario
      separator: ',', // Ajusta el separador si es necesario
      escape: '.', // Escapa las comillas dentro de los campos
      strict: true,
    });

    const insertQuery = `
      INSERT INTO licitaciones (expediente, tipo, objcontrato, estado, importe, fechas)
      VALUES (?, ?, ?, ?, ?, ?)
    `;

    stream.pipe(parser)
      .on('data', async (row) => {
        try {
                    // Verificar y limpiar los datos de cada columna
                    const expediente = row.expediente || '';
                    const tipo = row.tipo || '';
                    const objcontrato = (row.objeto || ''); // Elimina el punto al final si existe
                    const estado = row.estado || '';
                    const importe = row.importe || '';
                    // const importe = parseFloat(importeStr.replace(',', '.').replace('€', '')) || 0;
                    const fechas = (row.fechas || '');
          0
                    const values = [expediente, tipo, objcontrato , estado, importe, fechas];

                    console.log(row);
                    // Ejecutar la inserción en la base de datos
                    // await connection.execute(insertQuery, values);

        } catch (err) {
          console.error('Error al insertar fila:', err);
        }
      })
      .on('end', () => {
        console.log('Carga de CSV a MySQL completada');
        connection.end();
      });
  } catch (err) {
    console.error('Error en la lectura del archivo CSV:', err);
    connection.end();
  }
}

// Ruta al archivo CSV
const csvFilePath = path.join(__dirname, '/nuevos_datos/02-08-2024-21_licitaciones.csv');

// Llamada a la función para cargar datos
loadCSVToMySQL(csvFilePath);
