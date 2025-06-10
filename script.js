async function cargarDatosDesdeGoogleSheet() {
    // URL pública del CSV generado a partir de Google Sheets
    const URL_CSV =
        'https://docs.google.com/spreadsheets/d/e/2PACX-1vQUEFQ7R8Kel9_BMtpaQnQ_CTSkNu8Hlv_0D5jepEllAFBCqledXC02VVsRtDfbP3_DEvuLBWzvAvVs/pub?output=csv';

    // Fetch para obtener el CSV en texto plano
    const response = await fetch(URL_CSV);
    const csvText = await response.text();

    // Dividir CSV en líneas
    const lineas = csvText.trim().split('\n');
    // Extraer encabezados de la primera línea
    const encabezados = lineas[0].split(',');

    // Convertir cada línea en objeto con clave-valor según encabezados
    const datos = lineas.slice(1).map(linea => {
        const valores = linea.split(',');
        return Object.fromEntries(encabezados.map((h, i) => [h.trim(), valores[i]?.trim() || '']));
    });

    // Función para convertir fecha string 'YYYY-MM-DD' a timestamp Unix (segundos)
    const convertirFechaATimestamp = dateStr => {
        const ts = Math.floor(new Date(dateStr).getTime() / 1000);
        return isNaN(ts) ? null : ts;
    };

    // Arrays para almacenar series de datos para el gráfico
    let ventas = [], produccion = [], sugerida = [];
    // Objeto para mapear fechas y datos asociados
    let fechasMap = {};

    // Procesar cada fila de datos para llenar arrays y fechasMap
    datos.forEach(fila => {
        const ts = convertirFechaATimestamp(fila['Fecha']);
        if (!ts) return; // Omitir si la fecha no es válida

        const vendidas = parseInt(fila['Pizzas Vendidas'] || '0', 10);
        const producidas = fila['Pizzas Producidas'] ? parseInt(fila['Pizzas Producidas'], 10) : null;
        const partidoTexto = fila['Partido']?.trim() || '';
        const feriadoTexto = fila['Feriado']?.trim() || '';

        ventas.push({ time: ts, value: vendidas });
        produccion.push({ time: ts, value: producidas ?? 0 });

        fechasMap[fila['Fecha']] = { timestamp: ts, vendidas, producidas, partidoTexto, feriadoTexto };
    });

    // Ordenar las fechas para procesamiento secuencial
    const fechasOrdenadas = Object.keys(fechasMap).sort();

    // Calcular la serie de producción sugerida basada en ventas + factores extra
    for (let fecha of fechasOrdenadas) {
        const info = fechasMap[fecha];
        let base = info.vendidas + 15;   // Suma base de 15 a las ventas
        if (info.partidoTexto) base += 15;  // +15 si hay partido
        if (info.feriadoTexto) base += 15;  // +15 si es feriado
        sugerida.push({ time: info.timestamp, value: base });
    }

    // Calcular predicción para el día siguiente basado en promedio de las últimas 4 semanas en el mismo día
    const ultimaFecha = fechasOrdenadas.at(-1);
    const fechaDate = new Date(ultimaFecha);
    const diaSemana = fechaDate.getDay();

    let suma = 0, cuenta = 0;
    for (let semanasAtras = 1; semanasAtras <= 4; semanasAtras++) {
        const fechaPasada = new Date(fechaDate);
        fechaPasada.setDate(fechaPasada.getDate() - 7 * semanasAtras);
        if (fechaPasada.getDay() === diaSemana) {
            const clave = fechaPasada.toISOString().split('T')[0];
            const venta = fechasMap[clave]?.vendidas;
            if (venta !== undefined) {
                suma += venta;
                cuenta++;
            }
        }
    }

    // Si no hay datos, usar un valor por defecto 100
    const promedio = cuenta > 0 ? suma / cuenta : 100;
    const prediccionSugerida = Math.round(promedio + 15);
    const tsPrediccion = Math.floor(fechaDate.getTime() / 1000) + 86400; // +1 día en segundos
    // Agregar predicción al array sugerida
    sugerida.push({ time: tsPrediccion, value: prediccionSugerida });

    // Comprobar si la última fecha coincide con hoy y si 'Pizzas Producidas' está definida y válida
    const fechaHoy = new Date();
    const fechaHoyStr = fechaHoy.toISOString().split('T')[0]; // 'YYYY-MM-DD'

    const cardSugerida = document.querySelector('#card-sugerida');
    const infoUltimaFecha = fechasMap[ultimaFecha];

    // Calcular diferencia en días entre hoy y la última fecha con datos
    const fechaUltimaDate = new Date(ultimaFecha);
    const diffMs = fechaHoy - fechaUltimaDate;
    const diffDias = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (
        ultimaFecha === fechaHoyStr &&
        infoUltimaFecha &&
        infoUltimaFecha.producidas !== null &&
        !isNaN(infoUltimaFecha.producidas) &&
        infoUltimaFecha.producidas !== ''
    ) {
        // Si los datos están actualizados, mostrar la predicción
        cardSugerida.textContent = '';
        const span = document.createElement('span');
        span.textContent = prediccionSugerida;
        cardSugerida.appendChild(span);

        // Restaurar estilos normales
        cardSugerida.style.backgroundColor = '';
        cardSugerida.style.color = '';
    } else {
        // Si no están actualizados, mostrar mensaje con días sin registro
        cardSugerida.textContent = `Hace ${diffDias} día${diffDias !== 1 ? 's' : ''} no registra producción`;
        cardSugerida.style.backgroundColor = '#f8d7da'; // rojo claro
        cardSugerida.style.color = '#721c24';           // rojo oscuro
    }

    // Calcular totales de ventas en últimos 7 y 30 días para mostrar en tarjetas resumen
    const ultimoTimestamp = ventas[ventas.length - 1].time;
    const desde7 = ultimoTimestamp - 7 * 86400;
    const desde30 = ultimoTimestamp - 30 * 86400;

    const ultimos7 = ventas.filter(v => v.time > desde7).reduce((acc, v) => acc + v.value, 0);
    const ultimos30 = ventas.filter(v => v.time > desde30).reduce((acc, v) => acc + v.value, 0);

    document.querySelector('#card-ultimos7 span').textContent = ultimos7;
    document.querySelector('#card-ultimos30 span').textContent = ultimos30;

    // Crear gráfico con LightweightCharts
    const chart = LightweightCharts.createChart(document.getElementById('chart'), {
        width: 900,
        height: 320,
        layout: { background: { color: 'white' }, textColor: 'black' },
        grid: { vertLines: { visible: true }, horzLines: { visible: false } },
        timeScale: { timeVisible: true, secondsVisible: false },
    });

    // Añadir series al gráfico: ventas, producción y producción sugerida
    const seriesVentas = chart.addLineSeries({ color: 'red', title: 'Pizzas Vendidas' });
    const seriesProduccion = chart.addLineSeries({ color: 'green', title: 'Pizzas Producidas' });
    const seriesSugerida = chart.addLineSeries({ color: 'blue', lineStyle: 1, title: 'Producción Sugerida' });

    seriesVentas.setData(ventas);
    seriesProduccion.setData(produccion);
    seriesSugerida.setData(sugerida);

    // Añadir marcadores rojos para días donde ventas superan producción (alerta "SIN PIZZAS")
    const markersVentas = ventas
        .filter((p, i) => p.value > produccion[i]?.value)
        .map(p => ({
            time: p.time,
            position: 'aboveBar',
            color: 'red',
            shape: 'arrowDown',
            text: 'SIN PIZZAS',
        }));
    seriesVentas.setMarkers(markersVentas);

    // Marcadores para partidos (flechas azules)
    const markersPartido = fechasOrdenadas.map(f => {
        const info = fechasMap[f];
        if (info.partidoTexto) {
            return {
                time: info.timestamp,
                position: 'aboveBar',
                color: 'blue',
                shape: 'arrowDown',
                text: info.partidoTexto,
            };
        }
        return null;
    }).filter(Boolean);

    // Marcadores para feriados (flechas verdes)
    const markersFeriado = fechasOrdenadas.map(f => {
        const info = fechasMap[f];
        if (info.feriadoTexto) {
            return {
                time: info.timestamp,
                position: 'aboveBar',
                color: 'green',
                shape: 'arrowDown',
                text: 'Feriado',
            };
        }
        return null;
    }).filter(Boolean);

    seriesSugerida.setMarkers([...markersPartido, ...markersFeriado]);

    // Comparación de ventas semana actual vs semana anterior
    const hoy = ventas.at(-1).time;
    const hace7d = hoy - 7 * 86400;
    const hace14d = hoy - 14 * 86400;

    const semanaActual = ventas.filter(v => v.time > hace7d && v.time <= hoy).reduce((acc, v) => acc + v.value, 0);
    const semanaAnterior = ventas.filter(v => v.time > hace14d && v.time <= hace7d).reduce((acc, v) => acc + v.value, 0);
    const diferencia = semanaActual - semanaAnterior;

    // Mostrar resumen semanal en tarjeta con cambio y color según resultado
    const cardResumen = document.querySelector('#card-ultimos7');
    cardResumen.innerHTML = `
            <span>${semanaActual} pizzas vendidas los últimos 7 días</span><br>
            <span>
                ${diferencia >= 0 ? '⬆️' : '⬇️'} ${Math.abs(diferencia)} respecto a los 7 días anteriores
            </span>
        `;
    if (diferencia >= 0) {
        cardResumen.style.backgroundColor = '#d4edda';  // verde claro
        cardResumen.style.color = '#155724';            // texto verde oscuro
    } else {
        cardResumen.style.backgroundColor = '#f8d7da';  // rojo claro
        cardResumen.style.color = '#721c24';            // texto rojo oscuro
    }

    // Configurar rango visible del gráfico para mostrar últimas barras
    const totalBarras = ventas.length + 10;
    const barrasVisibles = 25;
    chart.timeScale().setVisibleLogicalRange({
        from: totalBarras - barrasVisibles,
        to: totalBarras,
    });
}

// Ejecutar la función principal para cargar datos y actualizar UI
cargarDatosDesdeGoogleSheet();
