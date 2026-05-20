  //Funzione che carica una texture
   function loadTexture(gl, path, fileName) {
      const texture = gl.createTexture();       // creazione oggetto texture
      gl.bindTexture(gl.TEXTURE_2D, texture);   // binding con target TEXTURE_2D

      // inizializzazione
      const level = 0;
      const internalFormat = gl.RGBA;
      const width = 1;
      const height = 1;
      const border = 0;
      const srcFormat = gl.RGBA;
      const srcType = gl.UNSIGNED_BYTE;

      // Pixel temporaneo (bianco opaco) per evitare errori prima del caricamento reale
      const pixel = new Uint8Array([255, 255, 255, 255]);  // opaque blue
      gl.texImage2D(gl.TEXTURE_2D, level, internalFormat,
               width, height, border, srcFormat, srcType, pixel);
      
      if(fileName){
         const image = new Image();
         image.onload = function() {                        // Quando l’immagine è caricata
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);   // capovolge l’immagine verticalmente per allinearla con le coordinate texture di WebGL
            gl.bindTexture(gl.TEXTURE_2D, texture);

            // Caricamento dell'immagine nella texture
            gl.texImage2D(gl.TEXTURE_2D, level, internalFormat,srcFormat, srcType, image);

            // Se dimensioni sono potenze di 2 -> mipmap
            if (isPowerOf2(image.width) && isPowerOf2(image.height)) 
                gl.generateMipmap(gl.TEXTURE_2D); // Yes, it's a power of 2. Generate mips.
            // altrimenti -> clamp e filtri lineari
            else {
               gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
               gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
               gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
               gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            }
         };
         image.src = path + fileName;
      }
      return texture;
      
      // controllo se un numero è potenza di 2
      function isPowerOf2(value) {
         return (value & (value - 1)) == 0;
      }
   }
   
//Funzione che utilizza la libreria glm_utils per leggere un eventuale 
//file MTL associato alla mesh
async function readMTLFile(MTLfileName, mesh) {
    try {
        const response = await fetch(MTLfileName);
        
        if (!response.ok) {
            throw new Error(`Errore HTTP! Stato: ${response.status}`);
        }

        // Contenuto file MTL
        const text = await response.text();
        // Parsing del file MTL e assegnazione dei materiali alla mesh
        glmReadMTL(text, mesh);
        
    } catch (error) {
        console.error("Errore nel caricamento del file:", error);
    }
}

  //Funzione che serve per recuperare i dati della mesh da un file OBJ
	async function retrieveDataFromSource(mesh){
      // Carica file OBJ
      await loadMeshFromOBJ(mesh);
      // Se il file OBJ ha un file MTL associato, lo carica e assegna i materiali alla mesh
      if(mesh.fileMTL) {
         await readMTLFile(mesh.sourceMesh.substring(0, mesh.sourceMesh.lastIndexOf("/")+1) + mesh.fileMTL, mesh.data); 
         mesh.materials = mesh.data.materials;  // Salva materiali
         delete mesh.data.materials;            // Rimuove duplicato
      }
   }

//Funzione che utilizza la libreria glm_utils per leggere un file OBJ
async function loadMeshFromOBJ(mesh) {
    try {
        const response = await fetch(mesh.sourceMesh);   // Richiede file OBJ

        if (!response.ok) {
            throw new Error(`Errore HTTP! Stato: ${response.status}`);
        }

        const resultText = await response.text();

        // Chiamiamo il parser (assumendo che subd_mesh sia disponibile globalmente)
        var result = glmReadOBJ(resultText, new subd_mesh());
     //scommentare/commentare per utilizzare o meno la LoadSubdivMesh
     //         mesh.data = LoadSubdivMesh(result.mesh);
        // Assegniamo i dati alla struttura mesh
        mesh.data = result.mesh;
        mesh.fileMTL = result.fileMtl;

        console.log("Mesh OBJ caricata correttamente:", mesh.sourceMesh);
        console.log(mesh.data);
    } catch (error) {
        console.error('Errore durante il caricamento della mesh: ' + error.message);
        throw error; 
    }
}

 /*========== Loading and storing the geometry ==========*/
   async function LoadMesh(gl,mesh) {

      await retrieveDataFromSource(mesh);                                                 // Carica OBJ + MTL
      Unitize(mesh.data);                                                                 // Normalizza dimensioni mesh
     //Ora che ho la mesh e il/i materiali associati, mi occupo di caricare 
     //la/le texture che tali materiali contengono
      var map = mesh.materials[1].parameter;
      var path = mesh.sourceMesh.substring(0, mesh.sourceMesh.lastIndexOf("/")+1);
      map.set("map_Kd", loadTexture(gl, path, map.get("map_Kd")));
      //map.set("map_Ks", loadTexture(gl, path, map.get("map_Ks")));

      if (map.get("map_Ks")) {
         map.set("map_Ks", loadTexture(gl, path, map.get("map_Ks")));
      } else {
         // texture nera esplicita
         const blackTex = gl.createTexture();
         gl.bindTexture(gl.TEXTURE_2D, blackTex);
         gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
                        new Uint8Array([0, 0, 0, 255]));
         map.set("map_Ks", blackTex);
      }

     // Array per dati geometria
     var x=[], y=[], z=[];          // vertici
     var xn=[], yn=[], zn=[];       // normali
     var xt=[], yt=[];              // coordinate texture
     var i0,i1,i2;
     var nvert=mesh.data.nvert;
     var nface=mesh.data.nface;
     var ntexcoord=mesh.data.textCoords.length;
     var nnormals=mesh.data.normal.length;

     // copia vertici
     for (var i=0; i<nvert; i++){
        x[i]=mesh.data.vert[i+1].x;
        y[i]=mesh.data.vert[i+1].y;
        z[i]=mesh.data.vert[i+1].z;       
      }
      // copia normali
      for (var i=0; i<nnormals-1; i++){
        xn[i]=mesh.data.normal[i+1].i;
        yn[i]=mesh.data.normal[i+1].j;
        zn[i]=mesh.data.normal[i+1].k;       
      }
      // copia coordinate texture
     for (var i=0; i<ntexcoord-1; i++){
        xt[i]=mesh.data.textCoords[i+1].u;
        yt[i]=mesh.data.textCoords[i+1].v;      
     }

     // Per ogni faccia (triangolo)
     for (var i=1; i<=nface; i++){
       i0=mesh.data.face[i].vert[0]-1;
       i1=mesh.data.face[i].vert[1]-1;
       i2=mesh.data.face[i].vert[2]-1;
       // Inserisce coordinate vertici nel buffer
       positions.push(x[i0],y[i0],z[i0],x[i1],y[i1],z[i1],x[i2],y[i2],z[i2]);
    //GC 01/08/25
    //scommentare queste 4 righe e commentare le 4 successive per flat shading 
      //  i0=mesh.data.facetnorms[i].i;
      //  i1=mesh.data.facetnorms[i].j;
      //  i2=mesh.data.facetnorms[i].k;
      //  normals.push(i0,i1,i2,i0,i1,i2,i0,i1,i2);
    //GC 01/08/25
    //scommentare queste 4 righe e commentare le 4 precedenti per Gouraud shading 
      //  i0=mesh.data.face[i].normalVertexIndex[0]-1;
      //  i1=mesh.data.face[i].normalVertexIndex[1]-1;
      //  i2=mesh.data.face[i].normalVertexIndex[2]-1;
      //  normals.push(xn[i0],yn[i0],zn[i0],xn[i1],yn[i1],zn[i1],xn[i2],yn[i2],zn[i2]);
       i0=mesh.data.face[i].textCoordsIndex[0]-1;
       i1=mesh.data.face[i].textCoordsIndex[1]-1;
       i2=mesh.data.face[i].textCoordsIndex[2]-1;
       texcoords.push(xt[i0],yt[i0],xt[i1],yt[i1],xt[i2],yt[i2]);
    //GC 01/08/25
    //se nel file .obj ci sono le normali vengono usate, altrimenti si usano quelle
    //calcolate da FacetNormals nella glm_utils.js
      if(nnormals>1){
         i0=mesh.data.face[i].normalVertexIndex[0]-1;
         i1=mesh.data.face[i].normalVertexIndex[1]-1;
         i2=mesh.data.face[i].normalVertexIndex[2]-1;
         normals.push(xn[i0],yn[i0],zn[i0],xn[i1],yn[i1],zn[i1],xn[i2],yn[i2],zn[i2]);
      }else{ // altrimenti flat shading con normali di faccia
         i0=mesh.data.facetnorms[i].i;
         i1=mesh.data.facetnorms[i].j;
         i2=mesh.data.facetnorms[i].k;
         normals.push(i0,i1,i2,i0,i1,i2,i0,i1,i2);
      }
     }         
     numVertices=3*nface;

     // Parametri materiale (illuminazione)
    if (mesh.fileMTL == null){
      ambient=mesh.materials[0].parameter.get("Ka");
      diffuse=mesh.materials[0].parameter.get("Kd");
      specular=mesh.materials[0].parameter.get("Ks");
      emissive=mesh.materials[0].parameter.get("Ke");
      shininess=mesh.materials[0].parameter.get("Ns");
      opacity=mesh.materials[0].parameter.get("Ni");
    }
    else{
      ambient=mesh.materials[1].parameter.get("Ka");
      diffuse=mesh.materials[1].parameter.get("Kd");
      specular=mesh.materials[1].parameter.get("Ks");
      emissive=mesh.materials[1].parameter.get("Ke");
      shininess=mesh.materials[1].parameter.get("Ns");
      opacity=mesh.materials[1].parameter.get("Ni");
    }
   }