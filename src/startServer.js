const express = require("express");
const dotenv = require("dotenv");
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const { ExtractPDF, ExtractElementType, FileRef } = require(
  "@adobe/pdfservices-node-sdk",
);

dotenv.config();

const app = express();
const port = process.env.NODE_ENV_PORT;
app.use(bodyParser.json());
app.use(cookieParser());
app.use(cors());

const storage = multer.diskStorage({
  destination: "uploads/",
  filename: function (_req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});
const upload = multer({ storage });

const credentials = ExtractPDF.Credentials.servicePrincipalCredentialsBuilder()
  .withClientId(process.env.PDF_SERVICES_CLIENT_ID)
  .withClientSecret(process.env.PDF_SERVICES_CLIENT_SECRET)
  .build();

const executionContext = ExtractPDF.ExecutionContext.create(credentials);

app.post(
  "/process-pdf",
  upload.single("pdfFile"),
  async function (req, res) {
    try {
      const { file } = req;
      if (!file) {
        return res.status(400).json({ error: "No PDF file uploaded." });
      }

      const options = new ExtractPDF.options.ExtractPdfOptions.Builder()
        .addElementsToExtract(ExtractElementType.TEXT)
        .build();

      const extractPDFOperation = ExtractPDF.Operation.createNew();
      const input = FileRef.createFromLocalFile(
        file.path,
        ExtractPDF.SupportedSourceFormat.pdf,
      );

      extractPDFOperation.setInput(input);
      extractPDFOperation.setOptions(options);

      let outputFilePath = createOutputFilePath();

      function createOutputFilePath() {
        const date = new Date();
        const dateString = date.getFullYear() +
          "-" +
          ("0" + (date.getMonth() + 1)).slice(-2) +
          "-" +
          ("0" + date.getDate()).slice(-2) +
          "T" +
          ("0" + date.getHours()).slice(-2) +
          "-" +
          ("0" + date.getMinutes()).slice(-2) +
          "-" +
          ("0" + date.getSeconds()).slice(-2);
        return "output/extract-" + dateString + ".zip";
      }

      extractPDFOperation.execute(executionContext)
        .then(function (result) {
          return result.saveAsFile(outputFilePath);
        })
        .then(function () {
          res.status(200).json({
            text: "Text extracted successfully",
            outputFilePath,
          });
        })
        .catch(function (err) {
          if (
            err instanceof ExtractPDF.Error.ServiceApiError ||
            err instanceof ExtractPDF.Error.ServiceUsageError
          ) {
            console.error(
              "Exception encountered while executing operation",
              err,
            );
            res.status(500).json({ error: "Error extracting text." });
          } else {
            console.error(
              "Exception encountered while executing operation",
              err,
            );
            res.status(500).json({ error: "Error extracting text." });
          }
        });
    } catch (error) {
      console.error("Error extracting text:", error);
      res.status(500).json({ error: "Error extracting text." });
    }
    return;
  },
);

app.get("/", function (_req, res) {
  res.send("Credit System API is up.");
});

export const startServer = async function () {
  app.listen(port, function () {
    console.log("Server started on port " + port);
  });
};

startServer();
