const fs = require('fs');
const path = require('path');
const mysql = require('mysql2');

// Configuración de la conexión a la base de datos MySQL
const connection = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'contratos_marbella'
});

// Función para verificar si el expediente ya existe en la base de datos
const expedienteExiste = (expediente, tabla, callback) => {
  connection.query(`SELECT COUNT(*) as count FROM ${tabla} WHERE expediente = ?`, [expediente], (err, results) => {
    if (err) throw err;
    callback(results[0].count > 0);
  });
};

// Función para validar si el expediente tiene los datos necesarios
const validarExpediente = (expedienteData) => {
  return expedienteData && expedienteData.expediente && expedienteData.tipo && expedienteData.objeto;
};

// Función para insertar un nuevo expediente en la base de datos
const insertarExpediente = (expedienteData, tabla) => {
  const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');

  // Añadir campos created_at y updated_at
  expedienteData.created_at = timestamp;
  expedienteData.updated_at = timestamp;

  // Validar que el expediente tiene datos antes de insertarlo
  if (validarExpediente(expedienteData)) {
    connection.query(`INSERT INTO ${tabla} SET ?`, expedienteData, (err, results) => {
      if (err) throw err;
      console.log(`Expediente ${expedienteData.expediente} insertado correctamente en la tabla ${tabla}`);
    });
  } else {
    console.log(`Expediente inválido, no se insertó en la tabla ${tabla}`);
  }
};

// Leer los archivos de la carpeta 'nuevos_datos'
fs.readdir('nuevos_datos', { withFileTypes: true }, (err, files) => {
  if (err) throw err;

  files.forEach(file => {
    if (file.isFile() && path.extname(file.name) === '.json') {
      let tabla = '';

      // Verificamos si el archivo corresponde a licitaciones o contratos menores
      if (file.name.includes('_licitaciones')) {
        tabla = 'licitaciones';
        console.log(`Procesando archivo de licitaciones: ${file.name}`);
      } else if (file.name.includes('_contratos_menores')) {
        tabla = 'contratos_menores';
        console.log(`Procesando archivo de contratos menores: ${file.name}`);
      } else {
        console.log(`Archivo ${file.name} no corresponde a licitaciones o contratos menores, se omite.`);
        return;
      }

      // Leer el contenido del archivo JSON
      fs.readFile(path.join('nuevos_datos', file.name), 'utf8', (err, data) => {
        if (err) throw err;

        let jsonData;
        try {
          jsonData = JSON.parse(data);
        } catch (e) {
          console.error(`Error al parsear el archivo ${file.name}: ${e.message}`);
          return;
        }

        // console.log(`Contenido de ${file.name}:`, jsonData);

        if (Array.isArray(jsonData)) {
          // Procesar cada entrada si es un array
          jsonData.forEach(entry => {
            expedienteExiste(entry.expediente, tabla, (existe) => {
              if (!existe) {
                insertarExpediente(entry, tabla);
              } else {
                console.log(`El expediente ${entry.expediente} ya existe en la tabla ${tabla}.`);
              }
            });
          });
        } else if (typeof jsonData === 'object' && jsonData !== null) {
          // Procesar si es un objeto individual
          expedienteExiste(jsonData.expediente, tabla, (existe) => {
            if (!existe) {
              insertarExpediente(jsonData, tabla);
            } else {
              console.log(`El expediente ${jsonData.expediente} ya existe en la tabla ${tabla}.`);
            }
          });
        } else {
          console.log(`El contenido del archivo ${file.name} no es ni un array ni un objeto.`);
        }
      });
    }
  });
});

// Cerrar la conexión a la base de datos cuando todo el proceso termine
process.on('exit', () => {
  connection.end();
});
